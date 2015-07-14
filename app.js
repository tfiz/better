/**
 * Crowd-sourcing playlist creation
 *
 * 1. User logins in
 * 2. User selects a playlist
 * 3. User is redirected to individual page where songs
 *      are added when chosen from a search
 *      (this page is available to anyone with the url)
 *
 * Modified from:
 * https://github.com/spotify/web-api-auth-examples/tree/master/authorization_code
 * More information at:
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var md5 = require('MD5');
var mongoose = require('mongoose');
var bodyparser = require('body-parser');

var client_id = process.env.SPOTIFY_CLIENT_ID || null;
var client_secret = process.env.SPOTIFY_SECRET || null;
var url_base = process.env.CROWDIFY_URL_BASE || null;
var public_dir = process.env.CROWDIFY_PUBLIC_DIR || null;

console.log(client_id);
console.log(client_secret);
console.log(url_base);

// may need to modify when not local
var redirect_uri = url_base + '/callback';
// replace with a database
mongoose.connect('mongodb://localhost/spot')
var db = mongoose.connection;

//db.on('error', console.error.bind(console, 'connection error:'));
var spotSchema = mongoose.Schema({
    token: { type: String, unique: true, dropDups: true },
    user: String,
    playlist: String,
    access_token: String,
    refresh_token: String,
    playlist_contents: {}
});

var Spot = mongoose.model('Spot', spotSchema);
var port = 5555;
var stateKey = 'spotify_auth_state';
var app = express();

app.use(express.static(__dirname + '/' + public_dir))
    .use(cookieParser());

// for json objs in POST requests
app.use(bodyparser.json());

// node ends on ctrl-c
process.on('SIGINT', function() {
    db.close(function () {
        console.log('Mongoose disconnect');
        process.exit(0);
    });
});


/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

var handleError = function(err, res, status) {
    console.error('fail at: ' + err);
    res.status(status).end();
}


// login event. User logins in with Spotify credentials and
//  we redirect to 'redirect_uri' with a code to obtain
//  a access_token
app.get('/login', function(req, res) {
    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    // authorization
    // we want to be able to read and write to all this user's
    // playlist
    var scope = 'playlist-modify-public playlist-modify-private';
    scope += ' playlist-read-private playlist-read-collaborative';
    res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
        response_type: 'code',
        client_id: client_id,
        show_dialog: false,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state
    }));
});


// redirect after successful Spotify login
// if we succeed in getting the access_token, refresh_token,
// and user_uri, redirect to the playlist selection page
app.get('/callback', function(req, res) {
    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    // make sure this originated from our login page
    if (state === null || state !== storedState || code === null) {
        console.error('response dump\n' + res)
        res.status(400).end();
    }
    else {
        res.clearCookie(stateKey);
        // request access_token and refresh_token
        var authOptions = {
            url: 'https://accounts.spotify.com/api/token',
                form: {
                code: code,
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
            },
            json: true
        };
        request.post(authOptions, function(error, response, body) {
            if (!error && response.statusCode === 200) {
                var access_token = body.access_token;
                var refresh_token = body.refresh_token;

                var options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: { 'Authorization': 'Bearer ' + access_token },
                    json: true
                };

                // request the user_uri
                request.get(options, function(error, response, body) {
                    if (error) {
                        console.error("fail at spotify me request");
                        res.status(400).end();
                    }

                    // redirect to the playlist selection page
                    res.redirect('select.html#' +
                        querystring.stringify({
                        access_token: access_token,
                        refresh_token: refresh_token,
                        user: body.id
                    }));
                });
            }
            else {
                console.error("fail at auth token request");
                res.status(400).end();
            }
        });
    }
});


// add this user-playlist combo to our list of instances
// we also add the access_token and refresh_token and
// generate a hash of the user+playlist_uri as a unique
// url to add songs to this instance
app.post('/add_account', function(req, res) {
    console.error(req.body);
    var user = req.body.user || null;
    var playlist = req.body.playlist || null;
    var access_token = req.body.access_token || null;
    var refresh_token = req.body.refresh_token || null;

    // validate request
    if (user === null || playlist === null || access_token === null ||
        refresh_token === null) {
        console.error("fail at user&playlist at least one parameter not provided");
        console.error(user + playlist + access_token + refresh_token);
        res.status(400).end();
    }
    else {
        var token = md5(user + playlist);
        // grab the current contents of this playlist, along with the snapshot id
        var playlist_contents = {};
        var options = {
            url: 'https://api.spotify.com/v1/users/' + user +
                 '/playlists/' + playlist + '/tracks',
            headers:{ 'Authorization': 'Bearer ' + access_token }
        };
        request.get(options, function(error, response, body) {
            // pull out the track ids of the playlist at this time
            tracks = JSON.parse(body)['items']
            if (error)
                handleError(error, response, 403);
            for (i in tracks) {
                playlist_contents[tracks[i]['track']['id']] = 1;
            }
            // add this instance to mongo
            var instance = {
                token: token,
                user: user,
                playlist: playlist,
                access_token: access_token,
                refresh_token: refresh_token,
                playlist_contents: playlist_contents
            };
            // replace if already there
            Spot.findOneAndUpdate({ 'token': token }, instance,
                                  { 'upsert': true, 'new': true },
                                  function (err, instance) {
                if (err) {
                    handleError(err, res, 400);
                }
                console.log("added " + instance.user + " with " + instance.playlist);
            });

            // and let the caller redirect to the unique add song page
            res.status(201).send({ redirect: '/add.html#token=' + token });
        });
    }
});

// gets the contents of this users playlist
app.get('/grab_playlist', function(req, res) {
    var token = req.query.token || null;

    if (token == null) {
        console.error("fail at grab_playlist, missing token");
        res.status(400).end();
    }
    else {
        Spot.find({ 'token': token }, function(err, instance) {
            if (err || instance.length === 0)
                return handleError(err, res, 400);

            // always the first result (only result)
            instance = instance[0];
            var options = {
                url: 'https://api.spotify.com/v1/users/' + instance.user +
                     '/playlists/' + instance.playlist + '/tracks',
                headers: { 'Authorization': 'Bearer ' + instance.access_token }
            };
            request.get(options, function(error, response, body) {
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(body);
            });
        });
    }
});


// accessable to anyone with the url
// does a lookup and adds the selected track to
// the selected playlist based on the provided hash/token
app.post('/add_track', function(req, res) {
    var track_id = req.body.id || null;
    var token = req.body.token || null;

    // validate request
    if (token === null || track_id === null) {
        console.error("fail at add track missing token: " + token + " of track id " + track_id);
        res.status(400).end();
    }
    else {
        // poll
        Spot.find({ 'token': token }, function(err, instance) {
            if (err || instance.length === 0)
                return handleError(err, res, 403);

            // always the first result (only result)
            instance = instance[0];
            // attempt to add this song to the instance
            // but first make sure it won't be a duplicate
            // 202 it's already there (accepted no process)
            if (track_id in instance.playlist_contents) {
                console.log("%s is already in the playlist so we'll skip it", track_id);
                res.status(202).end();
            }
            else {
                var options = {
                    url: 'https://api.spotify.com/v1/users/' + instance.user +
                       '/playlists/' + instance.playlist + '/tracks',
                    headers: { 'Authorization': 'Bearer ' + instance.access_token },
                    body: { 'uris': ['spotify:track:' + track_id] },
                    json: true
                };
                request.post(options, function(error, response, body) {
                    if (error) {
                        handleError("fail at add track, printing error" + error, res, 400);
                    }

                    // if we need to get a new access token do it before
                    // we make the add request
                    if (body.error) {
                        // refresh test
                        console.log('attempt refresh');
                        if (get_refresh_token(token)) {
                            console.log("failed to refresh");
                        }
                        else {
                            console.log("refresh success!");
                        }
                    }

                    // created 201
                    console.log("added %s to %s @ %s", track_id, instance.user, instance.playlist);
                    instance.playlist_contents[track_id] = 1;
                    var conditions = { token: token };
                    var update = { playlist_contents: instance.playlist_contents };
                    var options = {};
                    Spot.update(conditions, update, options, function(err, raw) {
                        if (err) {
                            console.error("problem adding to database, not fatal");
                        }
                    });
                    res.status(201).end();

                });
            }
        });
    }
});

var get_refresh_token = function(token) {
    if (token === null) {
        console.error("pass a token");
        return 1;
    }
    else {
        Spot.find({ 'token': token }, function(err, instance) {
            if (err || instance.length === 0) {
                console.error("db prob")
                return 1;
            }

            // always the first result (only result)
            instance = instance[0];

            var options = {
                url: 'https://accounts.spotify.com/api/token',
                headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
                form: { grant_type: 'refresh_token', 
                        refresh_token: instance.refresh_token }
            };
            console.log(options);
            request.post(options, function(error, response, body) {
                if (error) {
                    console.error("could't get token from accounts.spotify");
                    return 1;
                }
                else {
                    console.log("appears we refreshed successfully")
                    console.log(body);
                    console.log(body.access_token);
                    var conditions = { token: token };
                    var update = { access_token: body.access_token };
                    var options = {};
                    Spot.update(conditions, update, options, function(err, raw) {
                        if (err) {
                            console.error("problem updating access_token. need to register");
                            return 1;
                        }
                        else {
                            console.error("success updating access token");
                            return 0;
                        }
                    });
                }
            });
        });
    }
}

console.log('Listening on ' + port);
app.listen(port);
