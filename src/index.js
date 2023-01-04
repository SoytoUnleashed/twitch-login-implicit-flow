const express = require('express');
const cookieParser = require('cookie-parser');
const {config} = require('dotenv');
const fs = require('fs/promises');
const path = require('path');
const Handlebars = require('handlebars');
const fetch = require('node-fetch');
const {v4: uuid} = require('uuid');
config();

const app = express();
app.use(cookieParser());

const {
    PORT,
    TWITCH_CLIENT_ID,
    APP_DOMAIN
} = process.env


app.get('/', async (req, res) =>{
    const loginUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    loginUrl.searchParams.set('client_id', TWITCH_CLIENT_ID);
    loginUrl.searchParams.set('redirect_uri', `https://${APP_DOMAIN}/oauth`);
    loginUrl.searchParams.set('response_type', `token`);
    loginUrl.searchParams.set('scope', `user:read:email`);
    loginUrl.searchParams.set('force_verify', 'true');

    const html = await getHtml('index', {
        twitch_login_url: loginUrl.toString() 
    });

    res.send(html);
});


app.get('/oauth', async (req, res) => {
    const html = await getHtml('oauth', {
        TWITCH_CLIENT_ID,
        APP_DOMAIN
    });

    res.send(html);
});

app.get('/login', async (req, res) => {
    const {token} = req.query;
    const {email} = await getUserData(token);
    const sessionId = await setSession(email);


    res.cookie('SESSION_ID', sessionId, {
        maxAge: 90000,
        httpOnly: true
    });


    res.redirect('/privateArea');
});

app.get('/privateArea', async (req, res) => {
    const sessionCookie = req.cookies['SESSION_ID'];

    if (!sessionCookie) {
        return res.status(403).send();
    }

    const email = await getSession(sessionCookie);


    if (!email) {
        return res.status(403).send();
    }

    const html = await getHtml('privateArea', {
        email: email
    });

    res.send(html);
});


app.listen(PORT, () => console.log(`Server up and running on port ${PORT}`));


async function getHtml(fileName, data = undefined) {
    const filePath = path.join(__dirname, 'html', `${fileName}.hbs`);

    const hbsContent = await fs.readFile(filePath, 'utf-8');
    const template = Handlebars.compile(hbsContent);

    return template(data);
}


async function getUserData(accessToken) {
    const response = await fetch('https://api.twitch.tv/helix/users', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-id': TWITCH_CLIENT_ID
        }
    });

    const result = await response.json();

    const userData = result.data?.shift();
    return userData;
}


async function setSession(email) {
    const sessionFilePath = path.join(__dirname, '..', 'data', 'sessions.json');
    const sessions = JSON.parse(await fs.readFile(sessionFilePath, 'utf-8'));

    const sessionId = Object.entries(sessions)
        .filter(([key, value]) => value.toLowerCase() === email.toLowerCase())
        .map(([key, value]) => key)
        .shift();


    if (sessionId) {
        return sessionId;
    }
    else {
        const newSessionId = uuid();
        sessions[newSessionId] = email;

        await fs.writeFile(sessionFilePath, JSON.stringify(sessions, null, 2), 'utf-8');

        return newSessionId;
    }
}

async function getSession(sessionId) {
    const sessionFilePath = path.join(__dirname, '..', 'data', 'sessions.json');
    const sessions = JSON.parse(await fs.readFile(sessionFilePath, 'utf-8'));

    return sessions[sessionId];
}