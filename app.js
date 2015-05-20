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

var client_id = 'd6c0a432650f4184ac886377a5255014';
var client_secret = 'b7697eb6d6304a17b47302ede0188532';

// may need to modify when not local
var redirect_uri = 'http://localhost:8080/callback';
var playlist_select_url = '/select.html';
var add_user_plylist_pair_url = '/add_account';
var add_song_url = '/add.html';

// replace with a database
var temp_dict = {};

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

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
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
        show_dialog: true,
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
                    res.redirect(playlist_select_url + '#' +
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
app.get(add_user_plylist_pair_url, function(req, res) {
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
        // add this pair to the db
        console.log('adding ' + user + ' with ' + playlist);
        var key = md5(user + playlist);
        var value = {
            user: user,
            playlist: playlist,
            access_token: access_token,
            refresh_token: refresh_token
        }
        temp_dict[key] = value;
        // and let the caller redirect to the unique add song page
        res.send({ redirect: 'http://localhost:8080' + add_song_url + '#' + key });
    }
});

// accessable to anyone with the url
// does a lookup and adds the selected track to
// the selected playlist based on the provided hash/token
app.get('/add_track', function(req, res) {
    var id = req.query.id || null;
    var token = req.query.token || null;

    // validate request
    if (token === null || id === null) {
        console.error("fail at add track missing token: " + token + " of track id " + is);
        res.status(400).end();
    }
    else {
        // get and validate where we are adding
        var entry = temp_dict[token];
        if (entry === null) {
            console.error("fail at " + token + " is not a valid instance");
            res.status(400).end();
        }
        else {
            // attempt to add this song to the instance
            var options = {
                url: 'https://api.spotify.com/v1/users/' + entry['user'] +
                   '/playlists/' + entry['playlist'] + '/tracks',
                headers: { 'Authorization': 'Bearer ' + entry['access_token'] },
                body: { 'uris': ['spotify:track:' + id] },
                json: true
            };
            request.post(options, function(error, response, body) {
                if (error) {
                    console.error("fail at add track, printing error");
                    console.error(error);
                    res.status(400).end();
                }
                console.log("added %s to %s @ %s", id, entry['user'], entry['playlist']);
                res.status(200).end();
            });
        }
    }
});

console.log('Listening on 8080');
app.listen(8080);
