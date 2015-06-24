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

var client_id = process.env.SPOTIFY_CLIENT_ID;
var client_secret = process.env.SPOTIFY_SECRET;
var url_base = process.env.CROWDIFY_URL_BASE;
var public_dir = process.env.CROWDIFY_PUBLIC_DIR

console.log(client_id);
console.log(client_secret);
console.log(url_base);

// may need to modify when not local
var redirect_uri = url_base + '/callback';

// replace with a database
mongoose.connect('mongodb://localhost/spot')
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));

var spotSchema = mongoose.Schema({
    token: { type: String, unique: true, dropDups: true },
    user: String,
    playlist: String,
    access_token: String,
    refresh_token: String
});
var Spot = mongoose.model('Spot', spotSchema);

// node ends on ctrl-c
process.on('SIGINT', function() {
    db.close(function () {
        console.log('Mongoose disconnect');
        process.exit(0);
    });
});

var port = 5555;

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

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/' + public_dir))
    .use(cookieParser());

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
app.get('/add_account', function(req, res) {
    var user = req.query.user || null;
    var playlist = req.query.playlist || null;
    var access_token = req.query.access_token || null;
    var refresh_token = req.query.refresh_token || null;

    // validate request
    if (user === null || playlist === null || access_token === null ||
        refresh_token === null) {
        console.error("fail at user&playlist at least one parameter not provided");
        console.error(user + playlist + access_token + refresh_token);
        res.status(400).end();
    }
    else {
        var token = md5(user + playlist);
        var instance = {
            token: token,
            user: user,
            playlist: playlist,
            access_token: access_token,
            refresh_token: refresh_token
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
        res.send({ redirect: url_base + '/add.html#' + token });
    }
});


// accessable to anyone with the url
// does a lookup and adds the selected track to
// the selected playlist based on the provided hash/token
app.get('/add_track', function(req, res) {
    var track_id = req.query.id || null;
    var token = req.query.token || null;

    // validate request
    if (token === null || track_id === null) {
        console.error("fail at add track missing token: " + token + " of track id " + track_id);
        res.status(400).end();
    }
    else {
        // poll
        Spot.find({ 'token': token }, function(err, instance) {
            if (err || instance.length === 0)
                return handleError(err, res, 400);

            // always the first result (only result)
            instance = instance[0];
            // attempt to add this song to the instance
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
                else if (body.error) {
                    // refresh test
                    console.log('attempt refresh');
                    get_refresh_token(res, token, track_id, instance.refresh_token);
                    handleError(body.error, res, 400);
                }
                else {
                    console.log("added %s to %s @ %s", track_id, instance.user, instance.playlist);
                    res.redirect(url_base);
                }
            });
        })
    }
});

var get_refresh_token = function(res, token, track_id, refresh_token) {
    if (refresh_token === null || track_id === null || token === null) {
        handleError("invalid refresh request", res, 400);
    }
    else {
        var options = {
            url: 'https://api.spotify.com/api/token',
            headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
            form: { grant_type: 'refresh_token', refresh_token: refresh_token },
            json: true
        };
        console.log(options);
        request.post(options, function(error, response, body) {
            if (error) {
                handleError(error, res, 400)
            }
            else {
                console.log(body);
            }
        });
    }
};

console.log('Listening on ' + port);
app.listen(port);
