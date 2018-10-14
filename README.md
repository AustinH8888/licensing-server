# Licensing Server

## To Use

First, you'll have to fill in all the constants at the top to fit your specific
project, as well as run npm install to get all the required node modules.


Then, if you host this node server, you'll need a client to send the requests.


Finally, you'll have to handle the results. It isn't too terrible if you use libraries
to make the requests. Here's an example using the node module _axios_:

```javascript
const axios = require('axios');

axios.post('YOUR-URL/generateKeys', {
    number: keyCount,
    access_token: access_token
}).then((result) => {
    someFunction(result.data.result);
});
```

**However...**


The authorization of a client trying to create keys is pretty complicated. The
JavaScript code of a sign in button onClick function below:

```javascript
const http = require('http');
const url = require('url');
const qs = require('querystring');
const https = require('https');

function oAuthSignIn() {
    window.open("https://accounts.google.com/o/oauth2/v2/auth?" +
        "scope=https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/plus.me&" +
        "response_type=code&" +
        "redirect_uri=http://127.0.0.1:8080&" +
        "client_id=YOUR CLIENT ID&" +
        "prompt=consent"
    )
    var server = http.createServer().listen(8080, "127.0.0.1");
    server.addListener("request", (req, res) => {
        var code = url.parse(req.url, true).query.code;

        // Make post to get access token
        var post_data = qs.stringify({
            'code': code,
            'client_id': "YOUR CLIENT ID",
            'client_secret': "YOUR CLIENT SECRET",
            'redirect_uri': "http://127.0.0.1:8080",
            'grant_type': "authorization_code"
        });
        var authTokenRequest = https.request({
            host: "www.googleapis.com",
            path: "/oauth2/v4/token",
            method: "POST",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(post_data)
            }
        }, (result) => {
            result.setEncoding('utf8');
            var resData = '';
            result.on('data', chunk => {
                resData += chunk;
            });
            result.on('end', () => {
                handler.onResBuilt(res, resData, server)
            });
        });

        // Send request made above
        authTokenRequest.write(post_data);
        authTokenRequest.end();
    });
}
```

And the handler.onResBuilt definition:

```javascript
function onResBuilt(resToSend, resultData, server) {
    console.log(JSON.parse(resultData)['access_token']);
    access_token = JSON.parse(resultData)['access_token'];
    resToSend.writeHead(200, { 'Content-Type': 'text/plain' });
    resToSend.write('It worked, close this window.');
    resToSend.end();

    // Closes server after request comes through
    server.close(() => {
        console.log('closed server');
    });
}
```

This saves the access_token for use in the /generateKeys request, and
it is **required** to be able to make keys using this server design.



**Note: The code above is for a _SEPARATE NODE.JS CLIENT_! You'll need to find out how to**
**implement this to fit your client specifically.**


**If your client happens to be another node.js app, then this will fit like a glove.**