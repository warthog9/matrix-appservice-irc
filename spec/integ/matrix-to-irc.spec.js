/*
 * Contains integration tests for all Matrix-initiated events.
 */
"use strict";
// set up integration testing mocks
var proxyquire =  require('proxyquire');
var clientMock = require("../util/client-sdk-mock");
clientMock["@global"] = true; 
var ircMock = require("../util/irc-mock");
ircMock["@global"] = true;
var dbHelper = require("../util/db-helper");
var asapiMock = require("../util/asapi-controller-mock");
var q = require("q");

// s prefix for static test data, t prefix for test instance data
var sDatabaseUri = "mongodb://localhost:27017/matrix-appservice-irc-integration";
var sIrcServer = "irc.example";
var sBotNick = "a_nick";
var sChannel = "#coffee";
var sRoomId = "!foo:bar";
var sRoomMapping = {};
sRoomMapping[sChannel] = [sRoomId];
var sHomeServerUrl = "https://some.home.server.goeshere";
var sHomeServerDomain = "some.home.server";
var sAppServiceToken = "it's a secret";
var sAppServiceUrl = "https://mywuvelyappservicerunninganircbridgeyay.gome";
var sPort = 2;


// set up config
var ircConfig = {
    databaseUri: sDatabaseUri,
    servers: {}
};
ircConfig.servers[sIrcServer] = {
    nick: sBotNick,
    expose: {
        channels: true,
        privateMessages: true
    },
    rooms: {
        mappings: sRoomMapping
    }
}
var serviceConfig = {
    hs: sHomeServerUrl,
    hsDomain: sHomeServerDomain,
    token: sAppServiceToken,
    as: sAppServiceUrl,
    port: sPort
};


describe("Matrix-to-IRC (IRC not connected)", function() {
    var ircService = null;
    var mockAsapiController = null;

    beforeEach(function(done) {
        console.log(" === Matrix-to-IRC Test Start === ");
        ircMock._reset();
        clientMock._reset();
        ircService = proxyquire("../../lib/irc-appservice.js", {
            "matrix-js-sdk": clientMock,
            "irc": ircMock
        });
        mockAsapiController = asapiMock.create();

        // do the init
        dbHelper._reset(sDatabaseUri).then(function() {
            ircService.configure(ircConfig);
            return ircService.register(mockAsapiController, serviceConfig);
        }).done(function() {
            done();
        });
    });

    it("should bridge matrix messages as IRC text", function(done) {
        var tUserId = "@flibble:wibble";
        var tIrcNick = "flibble";
        var tBody = "I am a fish";
        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: tBody,
                msgtype: "m.text"
            },
            user_id: tUserId,
            room_id: sRoomId,
            type: "m.room.message"
        });
        ircMock._findClientAsync(sIrcServer, tIrcNick).then(function(client) {
            return client._triggerConnect();
        }).then(function(client) {
            return client._triggerJoinFor(sChannel);
        }).done(function(client) {
            // check it sent the message
            expect(client.say).toHaveBeenCalled();
            expect(client.say.calls[0].args[0]).toEqual(sChannel);
            expect(client.say.calls[0].args[1]).toEqual(tBody);
            done();
        });
    });

    it("should bridge formatted matrix messages as formatted IRC text", 
    function(done) {
        var tUserId = "@flibble:wibble";
        var tIrcNick = "flibble";
        var tFormattedBody = "I support <strong>strong bold</strong> and <b>"+
        'normal bold</b> and <b>bold <u>and underline</u><font color="green"> '+
        "including green</font></b>";
        var tFallback = "I support strong bold and normal bold and "+
        "bold and underline including green";
        var tIrcBody = "I support \u0002strong bold\u000f and \u0002normal bold"+
        "\u000f and \u0002bold \u001fand underline\u000f\u0002\u000303 including"+
        " green\u000f\u0002\u000f"; // last 2 codes not necessary!
        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: tFallback,
                format: "org.matrix.custom.html",
                formatted_body: tFormattedBody,
                msgtype: "m.text"
            },
            user_id: tUserId,
            room_id: sRoomId,
            type: "m.room.message"
        });
        ircMock._findClientAsync(sIrcServer, tIrcNick).then(function(client) {
            return client._triggerConnect();
        }).then(function(client) {
            return client._triggerJoinFor(sChannel);
        }).done(function(client) {
            // check it sent the message
            expect(client.say).toHaveBeenCalled();
            expect(client.say.calls[0].args[0]).toEqual(sChannel);
            var ircText = client.say.calls[0].args[1];
            expect(ircText.length).toEqual(tIrcBody.length);
            expect(ircText).toEqual(tIrcBody);
            done();
        });
    });

    it("should bridge escaped HTML matrix messages as unescaped HTML", 
    function(done) {
        var tUserId = "@flibble:wibble";
        var tIrcNick = "flibble";
        var tFormattedBody = "<p>this is a &quot;test&quot; &amp; some _ mo!re"+
        " fun ch@racters... are &lt; included &gt; here.</p>";
        var tFallback = "this is a \"test\" & some _ mo!re fun ch@racters... "+
        "are < included > here.";
        var tIrcBody = "this is a \"test\" & some _ mo!re fun ch@racters... "+
        "are < included > here.";
        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: tFallback,
                format: "org.matrix.custom.html",
                formatted_body: tFormattedBody,
                msgtype: "m.text"
            },
            user_id: tUserId,
            room_id: sRoomId,
            type: "m.room.message"
        });
        ircMock._findClientAsync(sIrcServer, tIrcNick).then(function(client) {
            return client._triggerConnect();
        }).then(function(client) {
            return client._triggerJoinFor(sChannel);
        }).done(function(client) {
            // check it sent the message
            expect(client.say).toHaveBeenCalled();
            expect(client.say.calls[0].args[0]).toEqual(sChannel);
            var ircText = client.say.calls[0].args[1];
            expect(ircText.length).toEqual(tIrcBody.length);
            expect(ircText).toEqual(tIrcBody);
            done();
        });
    });

    it("should bridge matrix emotes as IRC actions", function(done) {
        var tUserId = "@flibble:wibble";
        var tIrcNick = "flibble";
        var tBody = "thinks";
        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: tBody,
                msgtype: "m.emote"
            },
            user_id: tUserId,
            room_id: sRoomId,
            type: "m.room.message"
        });
        ircMock._findClientAsync(sIrcServer, tIrcNick).then(function(client) {
            return client._triggerConnect();
        }).then(function(client) {
            return client._triggerJoinFor(sChannel);
        }).done(function(client) {
            // check it sent the message
            expect(client.action).toHaveBeenCalled();
            expect(client.action.calls[0].args[0]).toEqual(sChannel);
            expect(client.action.calls[0].args[1]).toEqual(tBody);
            done();
        });
    });

    it("should bridge matrix notices as IRC notices", function(done) {
        var tUserId = "@flibble:wibble";
        var tIrcNick = "flibble";
        var tBody = "Some automated message";
        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: tBody,
                msgtype: "m.notice"
            },
            user_id: tUserId,
            room_id: sRoomId,
            type: "m.room.message"
        });
        ircMock._findClientAsync(sIrcServer, tIrcNick).then(function(client) {
            return client._triggerConnect();
        }).then(function(client) {
            return client._triggerJoinFor(sChannel);
        }).done(function(client) {
            // check it sent the message
            expect(client.ctcp).toHaveBeenCalled();
            expect(client.ctcp.calls[0].args[0]).toEqual(sChannel);
            expect(client.ctcp.calls[0].args[1]).toEqual("notice");
            expect(client.ctcp.calls[0].args[2]).toEqual(tBody);
            done();
        });
    });

    it("should bridge matrix images as IRC text with a URL", function(done) {
        var tUserId = "@flibble:wibble";
        var tIrcNick = "flibble";
        var tBody = "the_image.jpg";
        var tMxcSegment = "somedomain.com/somecontentid";
        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: tBody,
                url: "mxc://" + tMxcSegment,
                msgtype: "m.image"
            },
            user_id: tUserId,
            room_id: sRoomId,
            type: "m.room.message"
        });

        ircMock._emitter.on("say", function(client, channel, text) {
            expect(client.nick).toEqual(sBotNick);
            expect(client.addr).toEqual(sIrcServer);
            expect(channel).toEqual(sChannel);
            // don't be too brittle when checking this, but I expect to see the
            // image filename (body) and the http url.
            expect(text.indexOf(tBody)).not.toEqual(-1);
            expect(text.indexOf(tMxcSegment)).not.toEqual(-1);
            done();
        });

        // NB: The *BOT* sends the message here.
        ircMock._findClientAsync(sIrcServer, sBotNick).then(function(client) {
            return client._triggerConnect();
        }).then(function(client) {
            return client._triggerJoinFor(sChannel);
        }).done();
    });

    it("should bridge matrix topics as IRC topics", function(done) {
        var tUserId = "@flibble:wibble";
        var tIrcNick = "flibble";
        var tTopic = "Topics are amazingz";
        mockAsapiController._trigger("type:m.room.topic", {
            content: {
                topic: tTopic
            },
            user_id: tUserId,
            room_id: sRoomId,
            type: "m.room.topic"
        });
        ircMock._findClientAsync(sIrcServer, tIrcNick).then(function(client) {
            return client._triggerConnect();
        }).then(function(client) {
            return client._triggerJoinFor(sChannel);
        }).done(function(client) {
            // check it sent the topic
            expect(client.send).toHaveBeenCalled();
            expect(client.send.calls[0].args[0]).toEqual("TOPIC");
            expect(client.send.calls[0].args[1]).toEqual(sChannel);
            expect(client.send.calls[0].args[2]).toEqual(tTopic);
            done();
        });
    });

    it("should join 1:1 rooms invited from matrix", function(done) {
        var tUserId = "@flibble:wibble";
        var tIrcNick = "someone";
        var tUserLocalpart = sIrcServer+"_"+tIrcNick;
        var tIrcUserId = "@"+tUserLocalpart+":"+sHomeServerDomain;

        // there's a number of actions we want this to do, so track them to make
        // sure they are all called.
        var whoisDefer = q.defer();
        var registerDefer = q.defer();
        var joinRoomDefer = q.defer();
        var roomStateDefer = q.defer();
        var globalPromise = q.all([
            whoisDefer.promise, registerDefer.promise, joinRoomDefer.promise,
            roomStateDefer.promise
        ]);

        // get the ball rolling
        mockAsapiController._trigger("type:m.room.member", {
            content: {
                membership: "invite"
            },
            state_key: tIrcUserId,
            user_id: tUserId,
            room_id: sRoomId,
            type: "m.room.member"
        });

        // when it queries whois, say they exist
        ircMock._findClientAsync(sIrcServer, sBotNick).then(function(client) {
            return client._triggerConnect();
        }).then(function(client) {
            return client._triggerWhois(tIrcNick, true);
        }).done(function() {
            whoisDefer.resolve();
        });

        // when it tries to register, join the room and get state, accept them
        var sdk = clientMock._client();
        sdk.register.andCallFake(function(loginType, data) {
            expect(loginType).toEqual("m.login.application_service");
            expect(data).toEqual({
                user: tUserLocalpart
            });
            registerDefer.resolve();
            return q({
                user_id: tIrcUserId
            });
        });
        sdk.joinRoom.andCallFake(function(roomId) {
            expect(roomId).toEqual(sRoomId);
            joinRoomDefer.resolve();
            return q({});
        });
        sdk.roomState.andCallFake(function(roomId) {
            expect(roomId).toEqual(sRoomId);
            roomStateDefer.resolve({});
            return q([
            {
                content: {membership: "join"},
                user_id: tIrcUserId,
                state_key: tIrcUserId,
                room_id: sRoomId,
                type: "m.room.member"
            },
            {
                content: {membership: "join"},
                user_id: tUserId,
                state_key: tUserId,
                room_id: sRoomId,
                type: "m.room.member"
            }
            ]);
        });

        globalPromise.done(function() {
            done();
        }, function(){});
    });

    it("should join group chat rooms invited from matrix then leave them", 
    function(done) {
        done();
    });

    it("should join IRC channels when it receives special alias queries", 
    function(done) {
        var tChannel = "#foobar";
        var tRoomId = "!newroom:id";
        var tAliasLocalpart = sIrcServer + "_" + tChannel;
        var tAlias = "#" + tAliasLocalpart + ":" + sHomeServerDomain;

        // when we get the connect/join requests, accept them.
        var joinedIrcChannel = false;
        ircMock._findClientAsync(sIrcServer, sBotNick).then(function(client) {
            return client._triggerConnect();
        }).then(function(client) {
            return client._triggerJoinFor(tChannel);
        }).done(function() {
            joinedIrcChannel = true;
        });

        // when we get the create room request, process it.
        var sdk = clientMock._client();
        sdk.createRoom.andCallFake(function(opts) {
            expect(opts.room_alias_name).toEqual(tAliasLocalpart);
            return q({
                room_id: tRoomId
            });
        });
        
        mockAsapiController._query_alias(tAlias).done(function() {
            if (joinedIrcChannel) {
                done();
            }
        });
    });
});