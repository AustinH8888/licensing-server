const app = require('express')()
const bodyParser = require('body-parser')
const Datastore = require('@google-cloud/datastore')
const https = require('https')
const uuid = require('uuid/v4')

// Project ID for GCP Project
const id = 'YOUR-PROJECT-ID'

// Location of private API key generated for project
// Get this by creating a 'service account key'
// from the dropdown at https://console.cloud.google.com/apis/credentials
//
// NOTE: In a client that wishes to create keys, you'll need an OAuth client
//      ID that can also be made from the dropdown at the link above. This will
//      be used to get the access_token that /generateKeys requires.
const keyFile = '/PATH/TO/YOUR/SERVICEKEY.JSON'

// Kind of object in Datastore
const objectKind = 'YOUR-KEYKIND-NAME'

// Emails of users that are authorized to create new entries
const authorizedUsers = ['AUTHORIZED-EMAIL@gmail.com']

const datastore = new Datastore({
    projectId: id,
    keyFilename: keyFile
});


app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

// Enum for different states held by keys
const KeyStates = Object.freeze({
    INVALID: "invalid",
    USED: "used",
    VALID: "valid"
});

// Helper that sets existing keys as used by a pc identified by a hardware id.
// Also links an email to the hwid for easy user recognition
function setUsed(hwid, email, entity) {
    // NOTE: THIS IS THE ASSUMED STRUCTURE OF A KEY WITH ALL FIELDS CONTAINING VALUES!
    // 'key' is there by default, but everything in 'data' is assumed to have been set up
    // before using this server.
    const newEntity = {
        key: entity[datastore.KEY],
        data: {
            Key: entity.Key,
            inUse: true,
            hwid: hwid,
            email: email
        }
    }
    return datastore.upsert(newEntity)
}

// Resets a key, so a user can transfer their key to another pc
function setUnused(entity) {
    const newEntity = {
        key: entity[datastore.KEY],
        data: {
            Key: entity.Key,
            inUse: false
        }
    }
    return datastore.upsert(newEntity)
}

// Runs a datastore query to get a key specified by the UUID string
function getKey(userKey) {
    const query = datastore.createQuery(objectKind).filter('Key', '=', userKey)
    return datastore.runQuery(query).then(entities => {
        entities = entities[0]
        // No key
        if (entities.length == 0) {
            return {
                keystate: KeyStates.INVALID,
                entity: entities[0]
            }
        }
        // Key in use
        else if (entities[0]['inUse']) {
            return {
                keystate: KeyStates.USED,
                entity: entities[0]
            }
        }
        // Usable key
        else {
            return {
                keystate: KeyStates.VALID,
                entity: entities[0]
            }
        }
    })
}

// Uniform key formatting from a base UUID
function generateKey() {
    var res = []
    var uid = uuid().toString().split('').filter(c => c != '-')
    for (var i = 0; i < uid.length; i += 5) {
        res.push(uid.slice(i, i + 5).join('').toUpperCase())
    }
    return res.join('-')
}

// Saves new keys requested by a trusted user
function saveKeys(num, entities = []) {
    if (num > 0) {
        var objectKindKey = datastore.key(objectKind)
        var uuidKey = generateKey()
        var entity = {
            key: objectKindKey,
            data: {
                Key: uuidKey,
                inUse: false
            }
        }
        return datastore.insert(entity).then(() => {
            entities.push(entity)
            return saveKeys(num - 1, entities)
        }).catch((_) => {
            return saveKeys(num, entities)
        })
    }
    return Promise.resolve(entities)
}

// FOR TESTING REQUESTS
app.get('/', (req, res) => {
    res.send(
        `<h1>STOP, DON'T TOUCH ME THERE<br>THIS IS CORPORATE SOFTWARE</h1>
        <form method="get" action="/getkey">
            <h1>Test Validity
                <br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&darr;
            </h1>
            <input name="key" placeholder="key"/>
            <br><br>
            <input type="submit" value="Submit Key"/>
        </form>
        <br>
        <br>
        <br>
        <form method="post" action="/claimkey">
            <h1>Test Claims
                <br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&darr;
            </h1>
            <input name="hwid" placeholder="hwid"/>
            <br>
            <input name="email" placeholder="email"/>
            <br>
            <input name="key" placeholder="key"/>
            <br><br>
            <input type="submit" value="Submit Claim"/>
        </form>
        <br>
        <br>
        <br>
        <form method="post" action="/disownkey">
            <h1>Test Disown
                <br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&darr;
            </h1>
            <input name="hwid" placeholder="hwid"/>
            <br>
            <input name="key" placeholder="key"/>
            <br><br>
            <input type="submit" value="Submit Request"/>
        </form>`
    )
});

// HANDLES GET REQUESTS FOR CHECKING KEYS
// Requires a key field
app.get('/getkey', (req, res) => {
    var userKey = req.query.key
    getKey(userKey).then(result => {
        res.send(result)
    })
});

// HANDLES POSTS TO CLAIM KEYS
// Requires key, email, and hwid fields in the body
app.post('/claimkey', (req, res) => {
    var userKey = req.body.key
    var email = req.body.email
    var hwid = req.body.hwid
    getKey(userKey).then(result => {
        switch (result["keystate"]) {
            case KeyStates.INVALID:
                res.send({ success: false, reason: "Keystate is invalid" })
                break
            case KeyStates.USED:
                res.send({ success: false, reason: "Keystate is used" })
                break
            case KeyStates.VALID:
                setUsed(hwid, email, result["entity"]).then(() => {
                    res.send({ success: true, reason: null })
                }).catch((err) => {
                    res.send({ success: false, reason: err })
                })
                break
        }
    })
});

// HANDLES POSTS TO DISOWN KEYS
// Requires key and hwid fields in the body
app.post('/disownkey', (req, res) => {
    var keyToDisown = req.body.key
    var hwid = req.body.hwid
    getKey(keyToDisown).then(result => {
        switch (result["keystate"]) {
            case KeyStates.INVALID:
                res.send({ success: false, reason: "Keystate is invalid" })
                break
            case KeyStates.USED:
                if (hwid == result.entity.hwid) {
                    setUnused(result["entity"]).then(() => {
                        res.send({ success: true, reason: null })
                    }).catch((err) => {
                        res.send({ success: false, reason: err })
                    })
                } else {
                    res.send({ success: false, reason: "Associated hwid is not yours" })
                }
                break
            case KeyStates.VALID:
                res.send({ success: false, reason: "Keystate is unused" })
                break
        }
    })
});

// HANDLES POSTS TO CREATE KEYS
// Requires number and access_token fields in the body
app.post('/generateKeys', (req, res) => {
    // check oauth here!
    var numKeys = req.body.number
    var access_token = req.body.access_token
    https.get(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${access_token}`, result => {
        result.setEncoding('utf8')
        var data = ""
        result.on('data', chunk => {
            data += chunk
        })
        result.on('end', () => {
            if (authorizedUsers.indexOf(JSON.parse(data)['email']) > -1) {
                saveKeys(numKeys).then(entities => {
                    res.send({ result: entities })
                })
            } else {
                res.send({ result: [{ data: { Key: 'You\'re not authorized to create keys' } }] })
            }
        })
    })
});

app.listen(8000);
