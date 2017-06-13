const restify = require('restify');
const builder = require('botbuilder');

const express = require('express');
const bot_handoff = require('botbuilder-handoff');

const connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

const bot = new builder.UniversalBot(connector);

// Setup Restify Server
// const server = restify.createServer();
// server.use(restify.acceptParser(server.acceptable));
// server.use(restify.gzipResponse());
// server.use(restify.bodyParser());
// server.listen(process.env.port || 3978, function () {
//     console.log('%s listening to %s', server.name, server.url);
// });
// server.post('/api/messages', connector.listen());

const app = express();
app.listen(process.env.port || process.env.PORT || 3978, '::', () => {
    console.log('Server Up');
});
app.post('/api/messages', connector.listen());

// Replace this functions with custom login/verification for agents 
const isAgent = (session) => session.message.user.name.startsWith("Agent");

/**
    bot: builder.UniversalBot
    app: express ( e.g. const app = express(); )
    isAgent: function to determine when agent is talking to the bot
    options: { }
        - mongodbProvider and directlineSecret are required (both can be left out of setup options if provided in environment variables.)
        - textAnalyiticsKey is optional. This is the Microsoft Cognitive Services Text Analytics key. Providing this value will result in running sentiment analysis on all user text, saving the sentiment score to the transcript in mongodb.
**/
bot_handoff.setup(bot, app, isAgent, {
    mongodbProvider: process.env.MONGODB_PROVIDER,
    directlineSecret: process.env.MICROSOFT_DIRECTLINE_SECRET,
    textAnalyticsKey: process.env.CG_SENTIMENT_KEY
});

// Middleware
bot.use(
    builder.Middleware.dialogVersion({ version: 0.2, resetCommand: /^reset/i }),
    builder.Middleware.sendTyping()
);

bot.dialog('/', (session) => {
    var question = { "question": session.message.text };
    var client = restify.createJsonClient('https://westus.api.cognitive.microsoft.com');
    var options = {
        path: '/qnamaker/v2.0/knowledgebases/2605228c-265b-4dda-8b1d-1ac586784723/generateAnswer',
        headers: {
            'Ocp-Apim-Subscription-Key': '866f19d486274c8196bb1569a8a58c6b'
        }
    };

    client.post(options, question, (err, req, res, obj) => {
        if (err == null && obj.answers.length > 0) {
            for (var i in obj.answers) {
                if (parseInt(obj.answers[i].score) > 0.80) {
                    session.endDialog(obj.answers[i].answer);
                } else {
                    session.userData.convoId = session.message.address.conversation.id;
                    session.send('No good match in FAQ. Handing you off to next available agent, please hold while we connect you...');
                    session.replaceDialog('/handoff');
                }
            }
        } else {
            session.endDialog('Sorry, there was an error!');
        }
    });
});

bot.dialog('/handoff',
    (session, args) => {
        var port = process.env.port || process.env.PORT || 3978;
        var handoff = restify.createJsonClient(`http://localhost:${port}/api/conversations`);
        var options = {
            headers: {
                "Authorization": "Bearer " + process.env.MICROSOFT_DIRECTLINE_SECRET
            }
        };
        handoff.post(options, { "conversationId": session.userData.convoId }, (err, req, res, obj) => {
            if (err == null) {
                session.send("You have been queued up to speak to a live agent.");
            } else {
                console.log("Tell the user something went wrong.", err.code, err.message);
                session.endConversation("Sorry, something went wrong! We are restarting the bot.");
            }
        });
    }
);