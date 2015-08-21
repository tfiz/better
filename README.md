# crowdify
# Modified from Spotify Accounts Authentication Examples

Modified from Spotify’s Accounts Auth Examples and webexample for searching albums

Use 'forever' for better management
```bash
~ sudo npm install -g forever
~ forever start app.js
```
Use a reverse proxy or port forward to listen on port 80.
 -nginx works well

Since we use forever we hardcode all envs into the node application


1) http://crowdify.duckdns.org

2) Login with spotify creds

3) Select a playlist 
    - you must own the playlist i.e. is cannot be a colab playlist someone else
    created
    
4) Search and select a song (only first 20 results)
    - is this an issue?

5) share the url, anyone can use it


Known/Possible Issues/Todo:
 -Add managment page
