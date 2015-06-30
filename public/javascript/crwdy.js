
function addTrack(track_id) {
    $.ajax({
        url: url_base + '/add_track',
        data: {
            id: track_id,
            token: token
        },
        success: function(response) {
            console.log("added %s", track_id)
            resultsPlaceholder.innerHTML = entryTemplate( {text: track_id + " added"} );
            $('#query').val("");
            //update_listed_tracks();
        }
    });
};

function searchTracks(query) {
    $.ajax({
        url: 'https://api.spotify.com/v1/search',
        data: {
            q: query,
            type: 'track'
        },
        success: function (response) {
            // add to the response div results object
            resultsPlaceholder.innerHTML = resultsTemplate(response);
        }
    });
};

/*
function update_listed_tracks() {
    $.ajax({
        url: url_base + '/grab_playlist',
        data: {
            token: token
        },
        success: function(response) {
            console.log(response);
            playlistPlaceholder.innerHTML = playlistTemplate(response);
        }
    });
}   
*/

function hashset(a) {
    // no querysting
    if (a == "") {
        console.error("missing querysting");
        return {};
    }

    pairs = a.split('&');
    b = {}
    for (var i = 0; i < pairs.length; i++) {
        pair = pairs[i].split('=', 2);
        if (pair.length == 1)
            b[pair[0]] = "";
        else
            b[pair[0]] = pair[1];
    }
    return b;
}


function serachPlaylists(querySet, htmlTarget, templateTarget) {
    $.ajax({
        url: 'https://api.spotify.com/v1/users/' + querySet['user'] + '/playlists',
        headers: {
            Authorization: 'Bearer ' + querySet['access_token']
        },
        success: function (response) {
            // add to the results div object
            console.log(response);
            htmlTarget = templateTarget(response);
        }
    });
};
