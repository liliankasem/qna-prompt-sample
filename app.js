const restify = require('restify');
const builder = require('botbuilder');

const connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

const bot = new builder.UniversalBot(connector);

// Setup Restify Server
const server = restify.createServer();
server.use(restify.acceptParser(server.acceptable));
server.use(restify.gzipResponse());
server.use(restify.bodyParser());
server.listen(process.env.port || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});
server.post('/api/messages', connector.listen());

// Middleware
bot.use(
    builder.Middleware.dialogVersion({ version: 0.2, resetCommand: /^reset/i }),
    builder.Middleware.sendTyping()
);

//regex
const yesResponse = /yes|yeah|sure|yup|okay|ok|y/i;
const noResponse = /no|nope|nah|n/i;

bot.dialog('/', [
    (session) => {
        builder.Prompts.text(session, "Are you sure?");
    },
    (session, results) => {
        if(yesResponse.test(results.response)){
            session.send("Alright, here we go!");
        }else if(noResponse.test(results.response)){
            session.send("Well, I guess that's a no :(");
        }else{
            session.replaceDialog('/qa', { question : results.response});
        }
    }
]);

bot.dialog('/qa', (session, results) => {
    var client = restify.createJsonClient('https://westus.api.cognitive.microsoft.com');
    var options = {
        path: '/qnamaker/v2.0/knowledgebases/2605228c-265b-4dda-8b1d-1ac586784723/generateAnswer',
        headers: {
            'Ocp-Apim-Subscription-Key': '866f19d486274c8196bb1569a8a58c6b'
        }
    };

    var question = {"question": results.question};

    client.post(options, question, (err, req, res, obj) => {
        if(err == null && obj.answers.length > 0){
            for(var i in obj.answers){
                if(parseInt(obj.answers[i].score) > 0.5){
                    session.endDialog(obj.answers[i].answer);
                }else{
                    session.endDialog('No good match in FAQ.');
                }  
            }    
        }else{
            session.endDialog('Sorry, there was an error!');
        }
    });
});