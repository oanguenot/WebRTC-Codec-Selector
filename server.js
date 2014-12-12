
/**
 * HTTP 
 */

var http = require('http');

/**
 * HTTPS
 */

var https = require('https');

/**
 * File System
 */

var fs = require('fs');

/**
 * Path
 */

var path = require('path');

/**
 * websocket
 */

var WebSocketServer = require('websocket').server;

/**
 * HTTPS certificate & privatekey
 */

var options = {
  key: fs.readFileSync('privatekey.pem'),
  cert: fs.readFileSync('certificate.pem'),
  port: '443'
};

/**
 * Serve static pages thru HTTPS
 */

var serverhttps = https.createServer(options, function (req, res) {
    
    var filePath = '.' + req.url;
    if (filePath == './')
        filePath = './index.html';
        
    var extname = path.extname(filePath);
    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
    }
    
    path.exists(filePath, function(exists) {
    
        if (exists) {
            fs.readFile(filePath, function(error, content) {
                if (error) {
                    res.writeHead(500);
                    res.end();
                }
                else {
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(content, 'utf-8');
                }
            });
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });
}).listen(8886);

/**
 * Server static pages thru HTTP
 */

var connect = require('connect');
connect.createServer(
    connect.static(__dirname)
).listen(8887);


/**
 * Create server for managing websocket connection
 */

var server = http.createServer(function(request, response) {
    // process HTTP request. Since we're writing just WebSockets server
    // we don't have to implement anything.
});
server.listen(1337, function() { });

// create the server
wsServer = new WebSocketServer({
    httpServer: server
});

var connected = [],             // List of clients - ID - sockets - room
    connected_sockets= {},      // List of connected clients (could be not in a room - just connected to the server)
    conferences = {};           // List of conferences room

/* Private functions */

/**
 * Get conference info from a code
 */

var _getConferenceByRoom = function _getConferenceByRoom(code) {
    
    if(code in conferences){
        return {
            title : conferences[code].title,
            id: conferences[code].id,
            room: conferences[code].room
        };
    }
    else {
        return null;
    }
}

/**
 * Create a new conference and add it to the list of conferences
 */

var _addNewConference = function _addNewConference(title) {

    var conference = {
        title : title,
        id: new Date().getTime(),
        room: Math.floor(Math.random() * 1000) + '-' + Math.floor(Math.random() * 1000)
    }

    console.log("[CONNECTION::Add new room:" + conference.room + " | " + conference.title);

    conferences[conference.room] = {
        connections : [],
        title: conference.title,
        id: conference.id,
        room: conference.room
    };

    return conference;
};

/**
 * Join a conference
 * Create it if not exists
 */

var _createOrJoinConference = function _createOrJoinConference(title, roomID) {

    if( roomID in conferences) {
        
        return {
            title : conferences[roomID].title,
            id: conferences[roomID].id,
            room: conferences[roomID].room
        };
    }
    else {

        var conference = {
            title : title,
            id: new Date().getTime(),
            room: roomID
        };

        conferences[conference.room] = {
            connections : [],
            title: conference.title,
            id: conference.id,
            room: conference.room
        };

        return conference;
    }
};

/**
 * Add a new client 
 */

var _addNewClient = function _addNewClient(socket, callerid) {
    connected_sockets[callerid] = {socket: socket, id: '' + callerid};
};

/**
 * Send a ack message to a client
 */

var _sendAckMessage = function _sendAckMessage(socket, callerid) {
    var jsonMsg = {
        data: { 
            type: 'ack',
        },
        callee: callerid,
        caller: 'blabla'
    };

    socket.send(JSON.stringify(jsonMsg));
};


var _isConnected = function _isConnected(id) {
    return (id in connected_sockets);
};

/**
 * Answer to IQ Connected request
 */

var _answerIQConnected = function _answerIQConnected(socket, callerid, id, isConnected) {
    var connected = false || isConnected;

    if(!connected) {
        if(id in connected_sockets) {
            connected = true;
        }   
    }

    console.log("<"+ callerid + "> send iq_result " + connected + " for <"+ id + ">");

    // Send answer to sender
    var jsonMsg = {
        data: {
            type: 'iq_result',
            selector: 'connected',
            value: connected,
            id: id
        },
        callee: callerid,
        caller: 'blabla'
    };

    socket.send(JSON.stringify(jsonMsg));

    return connected;
};

/**
 * Join a room
 */

var _joinRoom = function _joinRoom(socket, callerid, room, caps) {

    // Add user to room list of connections
    // TODO: Perhaps to be stored in database ?
    conferences[room].connections.push({id: '' + callerid, socket: socket, caps: caps});
    console.log("<"+ callerid + "> has entered room <"+ room + ">");
    // Add to list of connected users
    // TODO: Perhaps to be stored in database ?
    connected.push({socket: socket, room: room, id: '' + callerid});

    // Answer user
    var jsonMsg = {
        data: {
            type: 'join_ack',
        },
        callee: callerid,
        caller: 'blabla'
    };

    socket.send(JSON.stringify(jsonMsg));
};

/**
 * Exit from a room
 */

var _exitRoom = function _exitRoom(socket, callerid, room, currentRoom) {
    // Remove the connection from the room and alerts all other peers
    if(currentRoom) {

        var idToExit = -1;

        for (var i=0;i<currentRoom.connections.length;i++) {
            if(currentRoom.connection[i].id === callerid) {
                idToExit = i;
            }
        }

        if(idToExit > -1) {
            console.log("Remove <" + callerid + "> from room <" + room + ">");
            delete currentRoom.connection[idToExit];
        }

        // Answer user
        var jsonMsg = {
            data: {
                type: 'exit_ack',
            },
            callee: callerid,
            caller: 'blabla'
        };

        socket.send(JSON.stringify(jsonMsg));
    }
};

/**
 * Alerts participants of a room about a new one
 */

 var _alertParticipants = function _alertParticipants(socket, callerid, event, currentRoom) {
    
    for (var i=0; i<currentRoom.connections.length; i++) {
        
        // Associate Socket <-> ID
        if(currentRoom.connections[i].socket !== socket) {
            console.log("Inform <" + currentRoom.connections[i].id + "> about new peer <" + callerid + ">");
            currentRoom.connections[i].socket.send(event);
        }
    }
}

/**
 * Alert newcomer about already joined participant
 */

var _alertNewcomer = function _alertNewcomer(socket, callerid, currentRoom) {

    for (var i=0; i<currentRoom.connections.length; i++) {
        
        // Associate Socket <-> ID
        if(currentRoom.connections[i].socket !== socket) {

            console.log("Inform <" + callerid + "> about connected <" + currentRoom.connections[i].id + ">");

            // Send to this peer all others connections
            var jsonMsg = {
                data: {
                    type: 'already_joined',
                    caps: currentRoom.connections[i].caps
                },
                callee: callerid,
                caller: currentRoom.connections[i].id
            };

            socket.send(JSON.stringify(jsonMsg));
        }
    }
};

var _sendDirectMessage = function(calleeid, event) {
    // console.log("Send direct message of type <" + type + "> from <" + callerid + "> to <" + calleeid + "> in room <" + room + ">");
    connected_sockets[calleeid].socket.send(event);
};

/**
 * Send a message to a specific peer
 */
var _sendMessageTo = function _sendMessageTo(calleeid, callerid, type, room, currentRoom, event) {

    var sockets = currentRoom.connections;

    console.log("SENDMESSAGETO", sockets.length);

    var found = false;

    for (var i = 0;i < sockets.length; i++) {

        console.log("IS ", sockets[i].id, typeof sockets[i].id, calleeid, typeof calleeid);

        if(sockets[i].id === calleeid) {
            console.log("Send message of type <" + type + "> from <" + callerid + "> to <" + calleeid + "> in room <" + room + ">");
            sockets[i].socket.send(event);
            found = true;
        }
    }

    if(!found) {
        console.log("Not found", calleeid, callerid, type);
    }
};

/**
 * Send a broadcast message to all peers of a room
 */

var _sendMessageToAll = function _sendMessageToAll(socket, calleeid, callerid, type, room, currentRoom, event) {

    var sockets = currentRoom.connections;

    for (var i = 0;i < sockets.length; i++) {
        // Except me
        if(sockets[i].socket !== socket) {
            console.log("Send broadcast message of type <" + type + "> from <" + callerid + "> to <" + calleeid + "> in room <" + room + ">");
            sockets[i].socket.send(event);
        }
        else {
            if(type === "im") {
                console.log("Send message <" + type + "> back to <" + callerid + "> (me) in room <" + room + ">");
                sockets[i].socket.send(event);
            }
        }
    }
};

/**
 * Remove from the list of connected
 */

var _disconnect = function _disconnect(caller) {
    
    if(caller in connected_sockets) {
        delete connected_sockets[caller];
        console.log("Peer <" + caller + "> has been disconnected"); 
    }
    else {
        console.log("Peer <" + caller + " not found, strange!");
    }
};


var _getPeerInfo = function _getRoomOfPeer(socket) {

    console.log("Get information of a peer...");

    var userInfo = null;
    
    // Try fo find if the user is in a room (room and id)
    for (var i = 0;i < connected.length; i++) {
        if(connected[i].socket === socket) {
            userInfo = {room: connected[i].room, id: connected[i].id};
           break;
        }
        else {
            console.log("User is not into a room");
        }
    }

    // If the user is not in the room, get his default info (only id)
    if(!userInfo) {
        for(var id in connected_sockets) {
            if(connected_sockets[id].socket === socket) {
                userInfo = {room: null, id: connected_sockets[id].id};
            }
        }
    }

    if(!userInfo) {
        console.log("User is not connected");
    }

    return userInfo;
};

var _removeFromRoom = function _removeFromRoom(socket, callerid, room, withAck) {

    var idToRemove = -1,
        old = null;

    for (var i = 0;i < connected.length; i++) {
        if(connected[i].socket === socket) {
            idToRemove = i;
            break;
        }
    }

    if(idToRemove > -1) {
        // Remove from list of connected
        old = connected.splice(idToRemove, 1);
        console.log("bye bye peer: " + old[0].id);

        if(room) {

            var conference = conferences[room];

            var index = -1;

            //Inform others peers that are in the same conference about the disconnection
            for (var i = 0; i < conference.connections.length; i++) {
                if(conference.connections[i].socket !== socket) {

                    var toSend = {
                        data: {
                            type:'exited'
                        },
                        callee: 'all',
                        caller:old[0].id
                    };
                    conference.connections[i].socket.send(JSON.stringify(toSend));
                }
                else {
                    index = i;

                    // Answer user (in case or manual leave of the room)
                    if(withAck) {
                        
                        var jsonMsg = {
                            data: {
                                type: 'exit_ack',
                            },
                            callee: callerid,
                            caller: 'blabla'
                        };

                        socket.send(JSON.stringify(jsonMsg));   
                    }
                }
            }

            // Remove from the room
            conference.connections.splice(index, 1);

            console.log("Still " + conference.connections.length + " user(s) in room " + room);
        }

    }

};

/**
 * Store information in database when the call starts = at least 2 persons in the room
 */

var _storeCallStartInformation = function _storeCallStartInformation(room) {

};

var _storeCallEndInformation = function _storeCallEndInformation(room, users) {

};

var _alertContactsAboutDisconnection = function _alertContactsAboutDisconnection(id) {

};






/**
 * Listen to webserver event
 */

wsServer.on('request', function(request) {
        var connection = request.accept(null, request.origin);
        console.log("New request received", request.origin);

        // When receiving a client message
        connection.on('message', function(evt) {

            if (evt.type === 'utf8') {
        
                // Get parameters
                var msg = JSON.parse(evt.utf8Data),
                    caller = msg.caller,
                    callee = msg.callee,
                    type = msg.data.type,
                    room = "",
                    currentRoom = "";

                // Manage the room
                if(msg.room) {
                    room = msg.room;
                    // Check if room already exists
                    if(! (room in conferences)) {
                        // If not create it
                        console.log("Create new room", room);
                        _createOrJoinConference('Room', room);
                    }
                    currentRoom = conferences[room];
                }

                console.log("RECEIVED from <" + caller + ">:" + evt.utf8Data);

                switch (type) {

                    // First message sending by a client when connecting to the server
                    case 'welcome':
                        console.log("<"+ caller + "> has joined");
                        // Add client to list
                        _addNewClient(connection, caller);
                        // Send ack message
                        _sendAckMessage(connection, caller);
                        break;
                    
                    // Request from a client
                    case 'iq':
                        if(msg.data.selector === 'connected') {
                            var isConnected = _answerIQConnected(connection, caller, msg.data.id, false);

                            // If recipient is online, alert him
                            if(isConnected) {
                                _answerIQConnected(connected_sockets[msg.data.id].socket, msg.data.id, caller, true);
                            }
                        }
                        break;

                    case 'poke':
                        if(_isConnected(callee)) {
                            _sendDirectMessage(callee, evt.utf8Data);
                        }
                        break;

                    // Join a room
                    case 'join':
                        _joinRoom(connection, caller, room, msg.data.caps);

                        _alertNewcomer(connection, caller, currentRoom);

                        _alertParticipants(connection, caller, evt.utf8Data, currentRoom);

                        _storeCallStartInformation(currentRoom);
                        break;

                    // Exit a room
                    case 'exit':

                        var participantsID = [];
                        
                        for (var i=0, l = currentRoom.connections.length; i < l; i++) {
                            participantsID.push(currentRoom.connections[i].id);
                        }

                        _storeCallEndInformation(room, participantsID);

                        _removeFromRoom(connection, caller, room, true);
                        break;

                    // Client close the connectio
                    case 'bye':
                        break;

                    // Others messages
                    default: 
                        // Send a message to a specific peer
                        if(callee !== "all") {
                            console.log("Send message <" + type + "> to <" + callee + ">");
                            _sendMessageTo(callee, caller, type, room, currentRoom, evt.utf8Data);
                        }
                        // Send a message to all peer
                        else {
                            _sendMessageToAll(connection, callee, caller, type, room, currentRoom, evt.utf8Data);
                        }
                        break;

                };

            }
            else {
                //console.log("RECEIVED OTHER:" + evt.binaryData);
            }   
        });

        // TODO: A adapter pour supprimer la connection dans la bonne room!!!!!
        connection.on('close', function() {

            console.log("Client disconnection detected...");

            //Get user info
            var peerInfo = _getPeerInfo(connection);

            // Remove from room
            if(peerInfo) {

                if(peerInfo.room) {

                    var participantsID = [];
                        
                    for (var i=0, l = conferences[peerInfo.room].connections.length; i < l; i++) {
                        participantsID.push(conferences[peerInfo.room].connections[i].id);
                    }

                    _storeCallEndInformation(peerInfo.room, participantsID);

                    _removeFromRoom(connection, peerInfo.id, peerInfo.room, false); 
                }

                // Disconnect
                _disconnect(peerInfo.id);

                // Inform contacts about peer disconnection
                _alertContactsAboutDisconnection(peerInfo.id);

                console.log("Still " + Object.keys(connected_sockets).length + " user(s) connected");
            }
            else {
                console.log("Still Strange, no peer linked to that connection...");
            }
        });

    });

    wsServer.on('close', function(request) {
    });