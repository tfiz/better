/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

var client_id = 'd6c0a432650f4184ac886377a5255014'; // Your client id
var client_secret = 'b7697eb6d6304a17b47302ede0188532'; // Your client secret
var redirect_uri = 'http://localhost:8080/callback'; // Your redirect uri

var access_token;
var user_id;
var playlist_uri = '4iYxCseY7aBFTo5yAokPpk';

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

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'playlist-modify-public playlist-modify-private';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {
  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/fail');
  }
  else {
    res.clearCookie(stateKey);
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

        access_token = body.access_token;
        var refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        // so we can get this user id
        request.get(options, function(error, response, body) {
            //access_token = body.access_token;
            user_id = body.id;
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/');
      }
      else {
        res.redirect('/fail')
      }
    });
  }
});


app.get('/add_track', function(req, res) {
  var id = req.query.id || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (true || state === null || state !== storedState) {

    // post info
    var options = {
      url: 'https://api.spotify.com/v1/users/' + user_id +
           '/playlists/' + playlist_uri + '/tracks',
      headers: { 'Authorization': 'Bearer ' + access_token },
      body: { 'uris': ['spotify:track:' + id] },
      json: true
    };

    // try
    request.post(options, function(err, res, body) {
        if (err) {
            return console.error(err);
        }
        console.log("added %s", id)
    });

    res.redirect('/');
}});


console.log('Listening on 8080');
app.listen(8080);
