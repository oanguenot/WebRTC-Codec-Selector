(function(/*! Brunch !*/) {
  'use strict';

  var globals = typeof window !== 'undefined' ? window : global;
  if (typeof globals.require === 'function') return;

  var modules = {};
  var cache = {};

  var has = function(object, name) {
    return ({}).hasOwnProperty.call(object, name);
  };

  var expand = function(root, name) {
    var results = [], parts, part;
    if (/^\.\.?(\/|$)/.test(name)) {
      parts = [root, name].join('/').split('/');
    } else {
      parts = name.split('/');
    }
    for (var i = 0, length = parts.length; i < length; i++) {
      part = parts[i];
      if (part === '..') {
        results.pop();
      } else if (part !== '.' && part !== '') {
        results.push(part);
      }
    }
    return results.join('/');
  };

  var dirname = function(path) {
    return path.split('/').slice(0, -1).join('/');
  };

  var localRequire = function(path) {
    return function(name) {
      var dir = dirname(path);
      var absolute = expand(dir, name);
      return globals.require(absolute, path);
    };
  };

  var initModule = function(name, definition) {
    var module = {id: name, exports: {}};
    cache[name] = module;
    definition(module.exports, localRequire(name), module);
    return module.exports;
  };

  var require = function(name, loaderPath) {
    var path = expand(name, '.');
    if (loaderPath == null) loaderPath = '/';

    if (has(cache, path)) return cache[path].exports;
    if (has(modules, path)) return initModule(path, modules[path]);

    var dirIndex = expand(path, './index');
    if (has(cache, dirIndex)) return cache[dirIndex].exports;
    if (has(modules, dirIndex)) return initModule(dirIndex, modules[dirIndex]);

    throw new Error('Cannot find module "' + name + '" from '+ '"' + loaderPath + '"');
  };

  var define = function(bundle, fn) {
    if (typeof bundle === 'object') {
      for (var key in bundle) {
        if (has(bundle, key)) {
          modules[key] = bundle[key];
        }
      }
    } else {
      modules[bundle] = fn;
    }
  };

  var list = function() {
    var result = [];
    for (var item in modules) {
      if (has(modules, item)) {
        result.push(item);
      }
    }
    return result;
  };

  globals.require = require;
  globals.require.define = define;
  globals.require.register = define;
  globals.require.list = list;
  globals.require.brunch = true;
})();
require.register("sonotone/io", function(exports, require, module) {
var VERSION = "0.5.0";

var LOG_ID = 'SONOTONE.IO';

var logger = require('sonotone/others/log');

logger.log(LOG_ID, 'Welcome to Sonotone!');
logger.log(LOG_ID, 'Running v' + VERSION);

logger.log(LOG_ID, "Module started...");

var config = require('sonotone/others/configuration'),
    localMedia = require('sonotone/stream/localMedia'),
    Events = require('sonotone/others/event'),
    Capabilities = require('sonotone/others/capabilities'),
    Peer = require('sonotone/others/peer'),
    sources = require('sonotone/stream/source'),
    sdp = require('sonotone/others/sdp');

var users = {};

var peers = {};

var events = new Events();

var transportLayer = null;

var tmp_offer = {};

config.useSTUN(true);
config.useTURN(true);

var onMessage = function onMessage(msg) {

    var json = null;
    var peer = null;

    switch (msg.data.type) {
        case 'join':
            peer = new Peer(msg.caller);
            subscribePeerEvents(peer);
            peer.caps(msg.data.caps);
            users[msg.caller] = peer;
            peers[msg.caller] = peer;
            logger.log(LOG_ID, "</-- onPeerConnected", peer);
            events.trigger('onPeerConnected', peer);
            break;
         case 'already_joined':
            peer = new Peer(msg.caller);
            subscribePeerEvents(peer);
            peer.caps(msg.data.caps);
            peers[msg.caller] = peer;
            users[msg.caller] = peer;
            logger.log(LOG_ID, "</-- onPeerAlreadyConnected", peer);
            events.trigger('onPeerAlreadyConnected', peer);
            break;
        case 'exited':
            var old = users[msg.caller];
            unsubscribePeerEvents(old);
            //delete users[msg.caller];
            delete(peers[msg.caller]);
            logger.log(LOG_ID, "</-- onPeerDisconnected", old);
            events.trigger('onPeerDisconnected', old);
            break;
        case 'offer':
            tmp_offer[msg.caller] = msg;
            var mediaUsed = sdp.getMediaInSDP(msg.data.sdp);
            logger.log(LOG_ID, "</-- onPeerCallOffered", {id: msg.caller, media: msg.media, type: mediaUsed});
            events.trigger('onPeerCallOffered', {id: msg.caller, media: msg.media, type: mediaUsed});
            break;
        case 'answer':
            logger.log(LOG_ID, "</-- onPeerCallAnswered", {id: msg.caller, media: msg.media});
            events.trigger('onPeerCallAnswered', {id: msg.caller, media: msg.media});
            users[msg.caller].setRemoteDescription(msg.media, msg.data);
            break;
        case 'candidate':
            peer = users[msg.caller];
            peer.addCandidate(msg.media, msg.data);
            break;
        case 'iq_result':
                json = {id: msg.data.id, value: msg.data.value, selector: msg.data.selector}; 
                logger.log(LOG_ID, "</-- onIQResult", json);
                events.trigger('onIQResult', json);    
            break;
        case 'im':
            json = {id: msg.caller, content: msg.data.content, private: msg.data.private};
            logger.log(LOG_ID, "</-- onPeerIMMessage", json);
            events.trigger('onPeerIMMessage', json);
            break;
        case 'poke':
            json = {id: msg.caller, content: msg.data.content, private: msg.data.private};
            logger.log(LOG_ID, "</-- onPeerPokeMessage", json);
            events.trigger('onPeerPokeMessage', json);
            break;
        case 'bye':
            json = {id: msg.caller, media: msg.media};
            logger.log(LOG_ID, "</-- onPeerEndCall", json);
            events.trigger('onPeerEndCall', json);
            break;
        case 'ack':
            //todo: what to do with this server ack
            events.trigger('onAck', null);    
            break;
        case 'join_ack':
            events.trigger('onJoinAck', null);
            break;
        case 'exit_ack': 
            events.trigger('onExitAck', null);
            break;
        default:
            logger.log(LOG_ID, "!!!Warning, message not handled", msg.data.type);
            break;
    }
};

var onUnknownMessage = function onUnknownMessage(msg) {
    logger.log(LOG_ID, "Incoming unknown message: " + msg);
};

var onTransportReady = function onTransportReady() {
    logger.log(LOG_ID, "Transport successfully connected");

    // Automatically call the welcome function of the transport
    transportLayer.welcome();
};

var onTransportClosed = function onTransportClosed() {
    logger.log(LOG_ID, "Transport closed");
};

var onTransportError = function onTransportError(err) {
    logger.log(LOG_ID, "Received from Transport: " + err);
};

var subscribeTransportEvents = function subscribeTransportEvents() {
    transportLayer.on('onTransportReady', onTransportReady, this);
    transportLayer.on('onTransportMessage', onMessage, this);
    transportLayer.on('onTransportUnknownMessage', onUnknownMessage,this);
    transportLayer.on('onTransportClosed', onTransportClosed, this);
    transportLayer.on('onTransportError', onTransportError, this);
};

var unsubscribeTransportEvents = function unsubscribeTransportEvents() {
    transportLayer.off('onTransportReady', onTransportReady);
    transportLayer.off('onTransportMessage', onMessage);
    transportLayer.off('onTransportUnknownMessage', onUnknownMessage);
    transportLayer.off('onTransportClosed', onTransportClosed);
    transportLayer.off('onTransportError', onTransportError);
};

var onSDPOfferToSend = function onSDPOfferToSend(event) {
    transportLayer.send(event);
};

var onSDPAnswerToSend = function onSDPAnswerToSend(event) {
    transportLayer.send(event);  
};

var onICECandiateReceived = function onICECandiateReceived(event) {
    transportLayer.send(event);
};

var onICECompleted = function onICECompleted(event) {
    events.trigger('onPeerICECompleted', event);    
};

var onICEConnected = function onICECompleted(event) {
    events.trigger('onPeerICEConnected', event);    
};

var onICEFailed = function onICECompleted(event) {
    events.trigger('onPeerICEFailed', event);    
};

var onICEClosed = function onICECompleted(event) {
    events.trigger('onPeerICEClosed', event);    
};

var onICEDisconnected = function onICECompleted(event) {
    events.trigger('onPeerICEDisconnected', event);    
};

var onSDPLocalMediaUsed = function onSDPLocalMediaUsed(event) {
    events.trigger('onPeerSDPLocalMediaUsed', event);
};

var onSDPRemoteMediaUsed = function onSDPRemoteMediaUsed(event) {
    events.trigger('onPeerSDPRemoteMediaUsed', event);
};

var onSDPCodecsNegotiated = function onSDPCodecsNegociated(event) {
    events.trigger('onPeerSDPCodecsNegotiated', event);
};

var onRemoteVideoStreamStarted = function onRemoteVideoStreamStarted(event) {
    logger.log(LOG_ID, "</-- onPeerCallVideoStarted", event);
    events.trigger('onPeerCallVideoStarted', event);  
};

var onRemoteVideoStreamEnded = function onRemoteVideoStreamEnded(event) {
    logger.log(LOG_ID, "</-- onPeerCallVideoEnded", event);
    events.trigger('onPeerCallVideoEnded', event);  
};

var onRemoteScreenStreamStarted = function onRemoteScreenStreamStarted(event) {
    logger.log(LOG_ID, "</-- onPeerCallScreenStarted", event);
    events.trigger('onPeerCallScreenStarted', event);  
};

var onStatReceived = function onStatReceived(event) {
    logger.log(LOG_ID, "</-- onPeerStatReceived", event);
    events.trigger('onPeerStatReceived', event);    
};

var subscribePeerEvents = function subscribePeerEvents(peer) {
    peer.on('onSDPOfferToSend', onSDPOfferToSend, this);
    peer.on('onSDPAnswerToSend', onSDPAnswerToSend, this);
    peer.on('onSDPLocalMediaUsed', onSDPLocalMediaUsed, this);
    peer.on('onSDPRemoteMediaUsed', onSDPRemoteMediaUsed, this);
    peer.on('onSDPCodecsNegotiated', onSDPCodecsNegotiated, this);
    peer.on('onICECandiateReceived', onICECandiateReceived, this);
    peer.on('onICEConnected', onICEConnected, this);
    peer.on('onICECompleted', onICECompleted, this);
    peer.on('onICEFailed', onICEFailed, this);
    peer.on('onICEClosed', onICEClosed, this);
    peer.on('onICEDisconnected', onICEDisconnected, this);
    peer.on('onRemoteVideoStreamStarted', onRemoteVideoStreamStarted, this);
    peer.on('onRemoteVideoStreamEnded', onRemoteVideoStreamEnded, this);
    peer.on('onRemoteScreenStreamStarted', onRemoteScreenStreamStarted, this);
    peer.on('onStat', onStatReceived, this);
};

var unsubscribePeerEvents = function unsubscribePeerEvents(peer) {
    peer.off('onSDPOfferToSend', onSDPOfferToSend);
    peer.off('onSDPAnswerToSend', onSDPAnswerToSend);
    peer.off('onSDPLocalMediaUsed', onSDPLocalMediaUsed);
    peer.off('onSDPRemoteMediaUsed', onSDPRemoteMediaUsed);
    peer.off('onSDPCodecsNegotiated', onSDPCodecsNegotiated);
    peer.off('onICECandiateReceived', onICECandiateReceived);
    peer.off('onICEConnected', onICEConnected);
    peer.off('onICECompleted', onICECompleted);
    peer.off('onICEFailed', onICEFailed);
    peer.off('onICEClosed', onICEClosed);
    peer.off('onICEDisconnected', onICEDisconnected);
    peer.off('onRemoteVideoStreamStarted', onRemoteVideoStreamStarted);
    peer.off('onRemoteVideoStreamEnded', onRemoteVideoStreamEnded);
    peer.off('onRemoteScreenStreamStarted', onRemoteScreenStreamStarted);  
    peer.off('onStat', onStatReceived);
};

module.exports = {

    /**
     * Set the Sonotone ID
     * @param {JSON} caps the user capabilities
     */
    setIdentity: function(caps) {
        Capabilities.setID(caps.id);
        Capabilities.userName(caps.username);
    },

    localMedia: function() {
        return localMedia;
    },

    remoteMedia: function(userid, media) {
        return users[userid].getRemoteStream(media);
    },

    sources: function() {
        return sources;
    },

    /**
     * Get or set the transport
     * @param {String} name The transport name
     * @param {Object} config The JSON Configuration of the transport
     * @return {Object} the Sonotone.IO.<xxx>Transport Object
     *
     * @api public
     */

    transport: function(name) {

        if(name !== undefined) {

            switch (name) {
                case "websocket":
                    transportLayer = require('./transport/websocket');
                    break;
                case "sip":
                     //transportLayer = new Sonotone.IO.SIPTransport(config);
                    break;
                case "remote":
                    //transportLayer = new Sonotone.IO.RemoteTransport(config);
                    break;
                default:
                    transportLayer = null;
                    break;
            }

            if(transportLayer) {
                subscribeTransportEvents(); 
            }
            else {
                logger.log(LOG_ID, '!!!ERROR, unknown transport');
            }
        }

        return transportLayer;
    },

    /**
     * Define a transport
     * For testing purpose today
     * @param {Object} transport The transport to set
     */

    setTransport: function(transport) {
        transportLayer = transport;
    },

    /**
     * Get the transport
     * For testing purpose today
     */

    getTransport: function() {
        return transportLayer;
    },

    endTransport: function() {
        unsubscribeTransportEvents();
    },

    /**
     * Send a message thu the transport
     * @param {String} msg The content to send
     * @param {String} to The recipient or all for broadcasting a message to all peer
     *
     * @api public
     */

    sendIMMessage: function(msg, to) {

        if(transportLayer) {

            var recipient = to || 'all';

            logger.log(LOG_ID, "Try to send an IM to", recipient);

            var message = {
                data: {
                    type: 'im',
                    content: msg,
                    private: (recipient !=='all')  ? true: false
                },
                caller: Capabilities.ID(),
                callee: recipient
            };

            transportLayer.send(message);
            return 0;
        }
        else {
            logger.log(LOG_ID, '!!!ERROR, no transport');
            return -1;
        }
    },

    /**
     * Send a poke thru the transport
     * @param {String} to The recipient or all for broadcasting a message to all peer
     * @param {string} type The different type of poke
     *
     * @api public
     */

    poke: function(to, type) {
        if(transportLayer) {
            var recipient = to || 'all';

            logger.log(LOG_ID, "Try to send a Poke <" + type + "> to", recipient);

            var message = {
                data: {
                    type: 'poke',
                    private: (recipient !=='all')  ? true: false,
                    content: type
                },
                caller: Capabilities.ID(),
                callee: recipient
            };

            transportLayer.send(message);
            return 0;
        }
        else {
            logger.log(LOG_ID, '!!!ERROR, no transport');
            return -1;
        }
    },

    /**
     * Query the server to check if a user is connected or not
     *
     * @api public
     */

    queryConnected: function(id) {
        if(transportLayer) {
            logger.log(LOG_ID, "IQ Connected", id);

            var message = {
                data: {
                    type: 'iq',
                    selector: 'connected',
                    id: id 
                },
                caller: Capabilities.ID(),
                callee: null
            };

            transportLayer.send(message);
            return 0;
        }
        else {
           logger.log(LOG_ID, '!!!ERROR, no transport');
            return -1; 
        }
    },

    /**
     * Try to call an other peer
     * @param {String} callee The recipient ID
     * @param {String} media 'video', 'screen', 'data' or 'video' if null
     * @param {String} audioCodec 'g711', 'opus' or default order of browser if null
     * @param {String} videoCodec 'vp8' or 'h264' or default order of browser if null 
     *
     * @api public
     */

    call: function(callee, media, audioCodec, videoCodec) {

        media = media || 'video';

        var peer = users[callee];

        if(peer) {
            // If no tmp_offer for that peer = call
            // if tmp_offer for that peer = answer
            peer.call(media, tmp_offer[callee], audioCodec, videoCodec);
            delete tmp_offer[callee];
        }
        else {
            return -1;
        }
    },

    endCall: function(callee, media) {

        media = media || 'video';

        var peer = users[callee];

        if(peer) {
            peer.endCall(media);
            // delete users[callee];
            // peer = null;
        }
        else {
            return -1;
        }
    },

    /**
     * Get the list of peers
     */

    peers: function() {
        return users;
    },

    /**
     * Get the number of peers
     */

    numberOfPeers: function() {
        return Object.keys(peers).length;
    },

    startStat: function(callee, media, interval) {
        media = media || 'video';
        interval = interval || 5000;

        var peer = users[callee];

        if(peer) {
            peer.startStat(media, interval);
        }
    },

    stopStat: function(callee, media) {
        media = media || 'video';

        var peer = users[callee];

        if(peer) {
            peer.stopStat(media);
        }  
    },

    /**
     * Subscribe to IO events
     * @param {String} eventName The event to subscribe
     * @param {Function} callbackFunction The function to call
     * @param {Object} context The context to use when calling the callback function
     *
     * @api public
     */

    on: function(eventName, callbackFunction, context) {
       events.on(eventName, callbackFunction, context);
    },

    /**
     * Unsubscribe to IO events
     * @param {String} eventName The event to unsubscribe
     * @param {Function} callbackFunction The registered callback
     *
     * @api public
     */    

    off: function(eventName, callbackFunction) {
        events.off(eventName, callbackFunction);
    },

    /**
     * Test only
     */
     
    _onMessage: function(msg) {
        onMessage(msg);
    }
};
});

require.register("sonotone/others/adapter", function(exports, require, module) {
var browserName = "Other";
var browserVersion = "unknown";

// Try to detect the navigator used
if(navigator.mozGetUserMedia && window.mozRTCPeerConnection) {
	browserName = "Firefox";
}
else if (navigator.webkitGetUserMedia && window.webkitRTCPeerConnection) {
	browserName = "Chrome";
}

module.exports = {

	browserName: function() {
		return browserName;
	},

	/**
	 * GetUserMedia
	 * Compliant Firefox/Chrome
	 */

	getUserMedia: function(constraints, callback, errCallback, context) {

		if(browserName === 'Chrome') {
			return navigator.webkitGetUserMedia.bind(navigator).call(context, constraints, callback, errCallback);
		}
		else if(browserName === 'Firefox') {
			return navigator.mozGetUserMedia.bind(navigator).call(context, constraints, callback, errCallback, context);
		}
		else {
			return null;
		}
	},

	/**
	 * GetVideoTracks
	 * Compliant Firefox/Chrome
	 */

	getVideoTracks: function(mediaStream) {

		if(browserName === 'Chrome') {
			if(typeof mediaStream.getVideoTracks === 'function') {
				return mediaStream.getVideoTracks();	
			}
			else {
				return [];
			}
			
		}
		else if(browserName === 'Firefox') {
			if(typeof mediaStream.getVideoTracks === 'function') {
				return mediaStream.getVideoTracks();
			}
			else {
				return [];
			}
		}
		else {
			return [];
		}
	},

	/**
	 * GetAudioTracks
	 * Compliant Firefox/Chrome
	 */

	getAudioTracks: function(mediaStream) {

		if(browserName === 'Chrome') {
			if(typeof mediaStream.getVideoTracks === 'function') {
				return mediaStream.getAudioTracks();
			}
			else {
				return [];
			}
		}
		else if(browserName === 'Firefox') {
			if(typeof mediaStream.getVideoTracks === 'function') {
				return mediaStream.getAudioTracks();
			}
			else {
				return [];
			}
		}
		else {
			return [];
		}
	},

	/**
	 * AttachToMEdia
	 * COmpliant Firefox/Chrome
	 */

	attachToMedia: function(element, stream) {
		if(browserName === 'Chrome') {
			if (typeof element.srcObject !== 'undefined') {
                element.srcObject = stream;
            } else if (typeof element.mozSrcObject !== 'undefined') {
                element.mozSrcObject = stream;
            } else if (typeof element.src !== 'undefined') {
                element.src = window.URL.createObjectURL(stream);
            }
		}
		else if(browserName === 'Firefox') {
			element.mozSrcObject = stream;
            
            element.play();
		}
		else {
			// Not compliant
		}
		return element;	
	},

	/**
	 * RTCPeerConnection
	 * Compliant Firefox/Chrome
	 */

	RTCPeerConnection: function (stun, constraints) {
		if(browserName === 'Chrome') {
			return new window.webkitRTCPeerConnection(stun, constraints);
		} else if (browserName === 'Firefox') {
			return new window.mozRTCPeerConnection(stun, constraints);
		} else {
			return null;
		}
	},

	/** RTCSessionDescription
	 * Compliant Firefox/Chrome
	 */

	RTCSessionDescription: function (sdp) {
		if(browserName === 'Chrome') {
			return new window.RTCSessionDescription(sdp);
		} else if (browserName === 'Firefox') {
			return new window.mozRTCSessionDescription(sdp);
		} else {
			return null;
		}	
	},

	/**
	 * RTCIceCandidate
	 * Compliant Firefox/Chrome
	 */

	RTCIceCandidate: function (candidate) {
		if(browserName === 'Chrome') {
			return new window.RTCIceCandidate(candidate);
		} else if (browserName === 'Firefox') {
			return new window.mozRTCIceCandidate(candidate);
		} else {
			return null;
		}
	},

	/**
	 * RTCPeerConnectionConstraints
	 * Compliant Firefox/Chrome
	 */

	RTCPeerConnectionConstraints: function() {
		if(browserName === 'Chrome') {
			return {
				optional: [
					{
						//DtlsSrtpKeyAgreement: true
					}
				]
			};
		} else if (browserName === 'Firefox') {
			return {
				optional: [
					{
						RtpDataChannels: true
					}
				]
			};
		} else {
			return {};
		}
	},

	/**
     * Get the video ratio used when rendered
     * Ratio received is sometimes not the same as contraints asked
     */

    getVideoRatio: function(HTMLVideoElement) {
        if(HTMLVideoElement) {

            var ratio = {
                width: HTMLVideoElement.videoWidth,
                height: HTMLVideoElement.videoHeight
            };

            return ratio;
        }
        else {
            return  null;
        }
    },
};
});

require.register("sonotone/others/capabilities", function(exports, require, module) {
var logger = require('sonotone/others/log');

var LOG_ID = 'CAPABILITIES';

var userID = '' + new Date().getTime();
logger.log(LOG_ID, "Default Sonotone ID", userID);

var caps = {};

module.exports = {
	ID: function() {
		return userID;
	},

	setID: function(id) {
		userID = '' + id;
		logger.log(LOG_ID, "New Sonotone ID", userID);
	},

	caps: function() {
		return caps;
	},

	userName: function(userName) {
		if(userName) {
			logger.log(LOG_ID, "Set userName to <" + userName + ">");
			caps.userName = userName;
		}
		return (caps.userName || 'Anonymous');
	}
};
});

require.register("sonotone/others/configuration", function(exports, require, module) {

var LOG_ID = 'CONFIG';

var logger = require('sonotone/others/log');

var turn = {
    url: 'turn:numb.viagenie.ca',
    credential: 'olivier.anguenot@free.fr',
    username: 'jabbah75'
};

var stun = {
    url: "stun:stun.l.google.com:19302"
};



var useSTUNServer = false,
    useTURNServer = false;

logger.log(LOG_ID, 'Module started...');
logger.log(LOG_ID, 'No TURN AND STUN configuration by default');


module.exports = {

    /**
     * Get/Set the STUN server to use
     * @param {Object} stunServer The server(s) to use
     */

    STUN: function(stunServer) {
        if(stunServer) {
            logger.log(LOG_ID, 'Configure STUN', stunServer);
            stun = stunServer;
        }
        return stun;
    },

    /**
     * Get/Set the TURN server to use
     * @param {Object} turnServer The server(s) to use
     */ 

    TURN: function(turnServer) {
        if(turnServer) {
            logger.log(LOG_ID, 'Configure TURN', turnServer);
            turn = turnServer;  
        }
        return turn;
    },

    /**
     * Choose to use or not the stun configuration
     * @param {Boolean} use True to use the stun configuration defined
     */

    useSTUN: function(use) {
        if(use) {
            logger.log(LOG_ID, 'STUN activated', stun); 
        } else {
            logger.log(LOG_ID, 'STUN deactivated', stun);
        }
        useSTUNServer = use;
    },

    /**
     * Choose to use or not the TURN configuration
     * @param {Boolean} use True to use the stun configuration defined
     */

    useTURN: function(use) {
        if(use) {
            logger.log(LOG_ID, 'TURN activated', turn);
        }
        else {
            logger.log(LOG_ID, 'TURN deactivated', turn);
        }
        useTURNServer = use;
    },

    /**
     * Return true if the STUN configuration is used
     */

    isSTUNUsed: function() {
        return useSTUNServer;
    },

    /**
     * Return true if the TURN configuration is used
     */

    isTURNUsed: function() {
        return useTURNServer;
    },

    /**
     * Get the STUN configuration to use accordingly to settings
     */

    getSTUNConfiguration: function() {
        if(useSTUNServer) {
            return stun;
        }
        else {
            return null;
        }
    },

    /**
     * Get the TURN configuration to use accordingly to settings
     */

    getTURNConfiguration: function() {
        if(useTURNServer) {
            return turn;
        }
        else {
            return null;
        }
    },

    getICEConfiguration: function() {

        if(useSTUNServer && useTURNServer) {
            return {"iceServers": [stun, turn]};
        }
        else if(useTURNServer) {
            return {"iceServers": [turn]};
        } 
        else if( useSTUNServer) {
             return {"iceServers": [stun]};
        }
        else {
            return {"iceServers": []};
        }
    }
};
});

require.register("sonotone/others/event", function(exports, require, module) {
function Events() {
    this.events = {};
}

/**
 * Subscribe to an event
 * @param {String} name The event to subscribe
 * @param {Function} callbackFunction The function to call
 * @param {Object} context The context to use when calling the callback function
 *
 * @api public
 */

Events.prototype.on = function(name, callback, context) {
    if(!this._events) {
        this._events = {};
    }
    
    var events = this._events[name] || (this._events[name] = []);
    
    events.push({callback: callback, ctx: context || this});
    
    return this;
};

/**
 * Unsubscribe to an event
 * @param {String} name The event to subscribe
 * @param {Function} callbackFunction The function to call
 *
 * @api public
 */

Events.prototype.off = function(name, callback) {
    if(this._events) {
        var events = this._events[name];
        if(events) {

            var index = -1;

            for (var i = 0, l = events.length; i < l; i++) {
                if(callback === events[i].callback) {
                    index = i;
                }
            }

            if(index > -1) {
                events.splice(index, 1);
            }
        }
    }
};

/**
 * Trigger an event
 * @param {String} name The event to subscribe
 * @param {args} Arguments to send to the callback function
 *
 * @api public
 */

Events.prototype.trigger = function(name, args) {
    if (!this._events) {
        return this;
    }
    var events = this._events[name];

    if (events) {
        for (var i=0;i<events.length;i++) {
            events[i].callback.call(events[i].ctx, args);
        }
    }
};

/**
 * Return the list of suscribed events/callbacks
 *
 * @api public/test
 */

Events.prototype.get = function() {
    return this.events;
};

module.exports = Events;
});

require.register("sonotone/others/log", function(exports, require, module) {
 var COLOR = {
    "SONOTONE.IO": "orange",
    "LOCALMEDIA": "blue",
    "WEBSOCKET": 'green',
    "PEERCONNECTION": 'Maroon',
    "REMOTEMEDIA": "MediumPurple",
    "TODO": "cyan",
    "DATACHANNEL": "Crimson",
    "CAPABILITIES": "black",
    "STREAM": "grey",
    "CONFIG": 'black',
    "PEER": 'chocolate',
    "SOURCE": 'black',
    "STAT": "black" 
};

var DEBUG = true;


function _log(category, message, arg) {
    var time = new Date(),
    ms = time.getMilliseconds();

    if(ms < 10) {
        ms = '00' + ms;
    } else if (ms < 100) {
        ms = '0' + ms;
    }

    var displaycat = category.substring(0, 12);
    while(displaycat.length < 12) {
        displaycat += ' ';
    }

    if(arg !== undefined) {
        console.log("%c|'O~O'| " + time.toLocaleTimeString() + ":" + ms + " [" + displaycat + "]   " + message + " | %O", "color:" + COLOR[category], arg);
    }
    else {
        console.log("%c|'O~O'| " + time.toLocaleTimeString() + ":" + ms + " [" + displaycat + "]   " + message, "color:" + COLOR[category]);   
    }
}

module.exports = {

    log: function(category, message, arg) {
        if (DEBUG) {
            _log(category, message, arg);                
        }
    },

    activateLog: function() {
        DEBUG = true;
    },

    unactivateLog: function() {
        DEBUG = false;
    },

    isLogActivated: function() {
        return DEBUG;
    }
};
});

require.register("sonotone/others/peer", function(exports, require, module) {
/**
 * Peer
 * Represents a peer (a user)
 * A peer can have several PeerConnection to him
 * One for Video, one for screen...
 */

var adapter = require('../others/adapter'),
    logger = require('../others/log'),
    Events = require('../others/event'),
    localMedia = require('sonotone/stream/localMedia'),
    Capabilities = require('../others/capabilities'),
    PeerConnection = require('sonotone/rtc/peerConnection'),
    RemoteMedia = require('sonotone/stream/remoteMedia');

var LOG_ID = 'PEER';

function Peer(id) {
    this._id = id || '' + new Date().getTime();
    this._events = new Events();
    this._caps = null;
    this._pc = {};
    this._remoteMedia = {};

    this._alreadyReceivedCandidates = [];

    logger.log(LOG_ID, 'Create a new Peer <' + this._id + '>');
}

/**
 * Subscribe to Local Media events
 * @param {String} eventName The event to subscribe
 * @param {Function} callbackFunction The function to call
 * @param {Object} context The context to use when calling the callback function
 *
 * @api public
 */

Peer.prototype.on = function(eventName, callbackFunction, context) {
   this._events.on(eventName, callbackFunction, context);
};

/**
 * Unsubscribe to IO events
 * @param {String} eventName The event to unsubscribe
 * @param {Function} callbackFunction The registered callback
 *
 * @api public
 */    

Peer.prototype.off = function(eventName, callbackFunction) {
    this._events.off(eventName, callbackFunction);
};

/**
 * Get/Set the Peer Capabilities
 */

Peer.prototype.caps = function(capabilities) {
    if(capabilities) {
        this._caps = capabilities;
    }
    return this._caps;
};

/**
 * Get the ID of the peer
 */

Peer.prototype.ID = function() {
    return this._id;
};

/**
 * Call a peer with a specified media (screen or video)
 * @param {String} media    The media used
 * @param {Object} offer    The offer if exists
 * @param {String} audioCodec 'g711', 'opus' or default order of browser if null
 * @param {String} videoCodec 'vp8' or 'h264' or default order of browser if null 
 */

Peer.prototype.call = function(media, offer, audioCodec, videoCodec) {
 
    var pc = null;

    media = media || 'video';

    if(offer) {
        logger.log(LOG_ID, "Answer peer <" + this._id + "> using " + media );
    }
    else {
        logger.log(LOG_ID, "Call peer <" + this._id + "> using " + media );    
    }

    if(media !== 'screen' && media !== 'video') {
        logger.log(LOG_ID, "Error, media unknown", media);      
        return 'media_unknown';
    }

    if(this._pc[media]) {
        logger.log(LOG_ID, "Error, already in call with this media", media);        
        return "already_in_call";
    }

    // Create PeerConnection
    pc = new PeerConnection(media, this._id);

    // Subscribe to PeerConnections events
    pc.on('onSDPOfferToSend', function(event) {
        this._events.trigger('onSDPOfferToSend', event);
    }, this);

    pc.on('onSDPAnswerToSend', function(event) {
        this._events.trigger('onSDPAnswerToSend', event);
    }, this);

    pc.on('onSDPLocalMediaUsed', function(event) {
        this._events.trigger('onSDPLocalMediaUsed', event);
    }, this);

    pc.on('onSDPCodecsNegotiated', function(event) {
        this._events.trigger('onSDPCodecsNegotiated', event);
    }, this);    

    pc.on('onSDPRemoteMediaUsed', function(event) {
        this._events.trigger('onSDPRemoteMediaUsed', event);
    }, this);    

    pc.on('onICECandiateReceived', function(event) {

        if(!pc.isConnected()) {

            logger.log(LOG_ID, "Send ICE Candidate received by Peer Connection <" + this._id + ">");

            var message = {
                data: {
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                },
                caller: Capabilities.ID(),
                callee: this._id,
                media: media
            };

            this._events.trigger('onICECandiateReceived', message);
        }
        else {
            logger.log(LOG_ID, "Do not send ICE Candidate because Peer Connection <" + this._id + "> is already connected");
        }

    }, this);

    pc.on('onICEConnected', function(event) {
        this._events.trigger('onICEConnected', event);
    }, this);

    pc.on('onICECompleted', function(event) {
        this._events.trigger('onICECompleted', event);
    }, this);

    pc.on('onICEFailed', function(event) {
        this._events.trigger('onICEFailed', event);
    }, this);

    pc.on('onICEClosed', function(event) {
        this._events.trigger('onICEClosed', event);
    }, this);

    pc.on('onICEDisconnected', function(event) {
        this._events.trigger('onICEDisconnected', event);
    }, this);    

    pc.on('onICECandidateEnd', function(event) {
        pc.addEarlyCandidates();
    }, this);

    pc.on('onRemoteStreamReceived', function(event) {
        
        this._remoteMedia[media] = new RemoteMedia(event.stream, media);
        this._remoteMedia[media].on('onRemoteVideoStreamEnded', function(json) {
            this._events.trigger('onRemoteVideoStreamEnded', json);
        }, this);

        var evt = {id: this._id, media: media, stream: event.stream};

        if(media === 'video') {
            logger.log(LOG_ID, "Remote Video Stream started...", event);
            this._events.trigger('onRemoteVideoStreamStarted', evt);
        }
        else {
            logger.log(LOG_ID, "Remote Screen Stream started...", event);
            this._events.trigger('onRemoteScreenStreamStarted', evt);    
        }
    }, this);

    pc.on('onStat', function(event) {
        this._events.trigger('onStat', event);
    }, this);

    this._pc[media] = pc;

    switch(media) {
        case 'video':
            if(localMedia.isCameraCaptured()) {
                pc.attach(localMedia.streamCamera());
            }
            break;
        case 'screen':
            if(localMedia.isScreenCaptured()) {
                pc.attach(localMedia.streamScreen());
            }
            break;
    }

    if(offer) {
        pc.setRemoteDescription(adapter.RTCSessionDescription(offer.data));
        pc.createAnswer(media, this._alreadyReceivedCandidates);    
    }
    else {
        pc.createOffer(audioCodec, videoCodec);
    }
};

Peer.prototype.endCall = function(media) {
    logger.log(LOG_ID, "End call with peer <" + this._id + "> using " + media);
    if(media in this._pc) {
        pc = this._pc[media];
        pc.close();

        delete this._pc[media];
        pc = null;

        if(localMedia.isCameraCaptured()) {
            //Relase camera
            localMedia.releaseCamera();
        }
    }
};

Peer.prototype.addCandidate = function(media, candidate) {

    var pc = this._pc[media];

    if(!pc) {
        logger.log(LOG_ID, "Warning, Not in call with this media, store candidates", media);
        this._alreadyReceivedCandidates.push(candidate);
        return;
    }

    pc.addCandidate(candidate);
};

Peer.prototype.startStat = function(media, interval) {

    if(media in this._pc) {
        pc = this._pc[media];
        pc.activateStat(interval);
    }
};

Peer.prototype.stopStat = function(media) {
    
    if(media in this._pc) {
        pc = this._pc[media];
        pc.stopStat();
    }
};

Peer.prototype.setRemoteDescription = function(media, SDP) {
    var pc = this._pc[media];

    if(!pc) {
        logger.log(LOG_ID, "Warning, Not in call with this media", media);        
        return "not_in_call";
    }

    pc.setRemoteDescription(adapter.RTCSessionDescription(SDP));
};

Peer.prototype.getRemoteStream = function(media) {
    return this._remoteMedia[media];
};

/**
 * For testing only
 */

Peer.prototype._peerConnections = function(pcs) {
    this._pc = pcs;
};

module.exports = Peer;


});

require.register("sonotone/others/sdp", function(exports, require, module) {
var forceCodec = function forceCodec(codec, codecList) {

    var codecIndex = -1;

    for (i = 0; i < codecList.length; i++) {
        if(tags[i] === codec) {
            codecIndex = i;
            break;
        }
    }

    codecList.unshift(codecList.splice(codecIndex, 1)[0]);

    return codecList;
};

module.exports = {

    forceG711: function(sdp) {

        var indexAudio = -1,
            beginAudioTags = -1;
            tags = null;

        var line, i;

        if(sdp.length > 0) {
            var splittedSDP = sdp.split('\r\n');

            for (i = 0, l = splittedSDP.length; i < l; i++) {

                line = splittedSDP[i];

                if(line.indexOf('m=audio') > -1) {
                       
                    indexAudio = i;
                    beginAudioTags = line.indexOf('RTP/SAVPF') + 10;
                    tags = line.substr(beginAudioTags).split(" ");

                    tags = forceCodec("8", tags);
                    tags = forceCodec("0", tags);
                    
                    break;
                }
            }

            line = splittedSDP[indexAudio];

            splittedSDP[indexAudio] = line.substring(0, beginAudioTags) + tags.join(" ");

            sdp = splittedSDP.join('\r\n');
        }

        return sdp;
    },

    forceH264: function(sdp) {

        var splittedSDP = sdp.split('\r\n'),
            indexVideo = -1,
            indexPos = -1,
            codec = [],
            list = [],
            codecList = {};

        for (var i = 0, l = splittedSDP.length; i < l; i++) {

            var line = splittedSDP[i];

            if(line.indexOf('m=video') > -1) {
                indexVideo = i;
                indexPos = line.indexOf('RTP/SAVPF') + 10; 
                list = line.substring(indexPos).split(" ");
            }

            if(line.indexOf('H264/90000') >-1 ) {
                var from = line.indexOf(':');
                var to = line.indexOf(' ');
                var codecName = line.substring(from + 1, to);
                var indexFound = -1;
                codec.push(codecName);
                //Remove from list
                for(var j = 0; j < list.length; j++) {
                    if(list[j] === codecName) {
                        indexFound = j;
                        break;
                    }
                }
                if(indexFound > -1) {
                    list.splice(indexFound, 1);
                }
            }
        }

        splittedSDP[indexVideo] = splittedSDP[indexVideo].substr(0, indexPos-1);
        // Add H264 codec first
        for (var k = 0; k < codec.length; k++) {
            splittedSDP[indexVideo] += " " + codec[k];
        }

        if(list.length > 0) {
            splittedSDP[indexVideo] += " " + list.join(' ');    
        }

        sdp = splittedSDP.join('\r\n');

        return sdp;
    },

    getFirstAudioCodec: function(sdp) {

        var indexAudio = -1,
            beginAudioTags = -1,
            tags = null,
            codecNumber = '',
            audioCodec = 'Unknown';

        var line, i;

        if(sdp.length > 0) {
            var splittedSDP = sdp.split('\r\n');

            for (i = 0, l = splittedSDP.length; i < l; i++) {

                line = splittedSDP[i];

                if(line.indexOf('m=audio') > -1) {
                       
                    indexAudio = i;
                    beginAudioTags = line.indexOf('RTP/SAVPF') + 10;
                    tags = line.substr(beginAudioTags).split(" ");

                    if(tags && tags.length > 0) {
                        codecNumber = tags[0];    
                    }
                    else {
                        codecNumber = '';
                    }
                }
                if(line.indexOf('a=rtpmap:') >-1 ) {
                    var number = line.substring(9, line.indexOf(' '));
                    if(number === codecNumber) {
                        audioCodec = line.substring(line.indexOf(' ') + 1);
                    }
                }
            }
        }
        return audioCodec;
    },

    getFirstVideoCodec: function(sdp) {

        var indexAudio = -1,
            beginAudioTags = -1,
            tags = null,
            codecNumber = '',
            videoCodec = 'Unknown';

        var line, i;

        if(sdp.length > 0) {
            var splittedSDP = sdp.split('\r\n');

            for (i = 0, l = splittedSDP.length; i < l; i++) {

                line = splittedSDP[i];

                if(line.indexOf('m=video') > -1) {
                       
                    indexAudio = i;
                    beginAudioTags = line.indexOf('RTP/SAVPF') + 10;
                    tags = line.substr(beginAudioTags).split(" ");

                    if(tags && tags.length > 0) {
                        codecNumber = tags[0];    
                    }
                    else {
                        codecNumber = '';
                    }
                }
                if(line.indexOf('a=rtpmap:') >-1 ) {
                    var number = line.substring(9, line.indexOf(' '));
                    if(number === codecNumber) {
                        videoCodec = line.substring(line.indexOf(' ') + 1);
                    }
                }
            }
        }
        return videoCodec;
    },

    getMediaInSDP: function(sdp) {

        var media = 'no';
        var current='audio';
        var hasAudio = false,
            hasVideo = false;

        var splittedSDP = sdp.split('\r\n');
        for(var i=0; i < splittedSDP.length; i++) {
            var line = splittedSDP[i];
            if(line.indexOf('m=audio') > -1) {
                current = 'audio';
            }
            if(line.indexOf('m=video') > -1) {
                current = 'video';
            }
            if(line.indexOf('sendrecv')  > -1 || line.indexOf('sendonly') > -1) {
                if(current === 'audio') {
                    hasAudio = true;
                } else {
                    hasVideo = true;
                }
            }
        }

        if(hasAudio && hasVideo) {
            media = 'full';
        }
        else {
            if(hasAudio) {
                media = 'audio';
            }
            else if( hasVideo) {
                media = 'video';
            }
            else {
                media = 'no';
            }
        }

        return media;
    }

};
});

require.register("sonotone/others/stat", function(exports, require, module) {
var logger = require('sonotone/others/log');

var LOG_ID = 'STAT';

module.exports = {

	chromeStat: function(items) {

		var stat = {
			browser: 'chrome',
			OUT_MIC: {
				muted: true,
				description: 'local microphone',
				codec:'',
				inputLevel:0,
				bytesSent: 0,
				packetsLost: 0,
				packetsSent: 0
			},
			IN_MIC: {
				muted: true,
				description: 'remote microphone',
				codec: '',
				outputLevel: 0,
				bytesReceived: 0,
				packetsLost: 0,
				packetsReceived: 0
			},
			OUT_CAM: {
				muted: true,
				description: 'local camera',
				codec:'',
				framerate:0,
				bytesSent: 0,
				packetsLost: 0,
				packetsSent: 0	
			},
			IN_CAM: {
				muted: true,
				description: 'remote camera',
				codec: '',
				framerate: 0,
				bytesReceived: 0,
				packetsLost: 0,
				packetsReceived: 0	
			},
			timestamp : new Date().getTime()
		};

		var item,
		lost = 0;

		for (var i = 0; i<items.length; i++) {
			item = items[i];

			if(item.transportId) {
				// Audio Stat
				if(item.audioInputLevel) {
					// local microphone
					stat.OUT_MIC.codec = item.googCodecName;
					stat.OUT_MIC.inputLevel = parseInt(item.audioInputLevel);
					stat.OUT_MIC.bytesSent = parseInt(item.bytesSent);
					lost = parseInt(item.packetsLost);
					if(lost < 0) {
						lost = 0;
					}
					stat.OUT_MIC.packetsLost = lost;
					stat.OUT_MIC.packetsSent = parseInt(item.packetsSent);
					if(stat.OUT_MIC.inputLevel > 0) {
						stat.OUT_MIC.muted = false;
					}
				} 
				if(item.audioOutputLevel) {
					// remote microphone
					stat.IN_MIC.codec = item.googCodecName;	
					stat.IN_MIC.outputLevel = parseInt(item.audioOutputLevel);	
					stat.IN_MIC.bytesReceived = parseInt(item.bytesReceived);
					lost = parseInt(item.packetsLost);
					if(lost < 0) {
						lost = 0;
					}
					stat.IN_MIC.packetsLost = lost;
					stat.IN_MIC.packetsReceived = parseInt(item.packetsReceived);
					if(stat.IN_MIC.outputLevel > 0) {
						stat.IN_MIC.muted = false;
					}
				}
				// Video Stat
				if(item.googFirsReceived) {
					// local camera					
					stat.OUT_CAM.codec = item.googCodecName || '';
					stat.OUT_CAM.bytesSent = parseInt(item.bytesSent);
					lost = parseInt(item.packetsLost);
					if(lost < 0) {
						lost = 0;
					}
					stat.OUT_CAM.packetsLost = lost;
					stat.OUT_CAM.framerate = parseInt(item.googFrameRateInput);
					stat.OUT_CAM.packetsSent = parseInt(item.packetsSent);
					stat.OUT_CAM.muted = false;
				}
				if(item.googFirsSent) {
					// remove camera
					stat.IN_CAM.codec = item.googCodecName || '';
					stat.IN_CAM.bytesReceived = parseInt(item.bytesReceived);
					if(lost < 0) {
						lost = 0;
					}
					stat.IN_CAM.packetsLost = lost;
					stat.IN_CAM.packetsReceived = parseInt(item.packetsReceived);
					stat.IN_CAM.framerate = parseInt(item.googFrameRateOutput);
					stat.IN_CAM.muted = false;
				}
			}
		}

		return (stat);
	},

	firefoxStat: function(items) {

		var stat = {
			browser: 'firefox',
			OUT_MIC: {
				muted: false,
				description: 'local microphone',
				codec:'',
				inputLevel:0,
				bytesSent: 0,
				packetsLost:0,
				packetsSent: 0
			},
			IN_MIC: {
				muted: false,
				description: 'remote microphone',
				codec: '',
				outputLevel: 0,
				bytesReceived: 0,
				packetsLost: 0,
				packetsReceived: 0
			},
			OUT_CAM: {
				muted: false,
				description: 'local camera',
				codec:'',
				framerate:0,
				bytesSent: 0,
				packetsLost: 0,
				packetsSent: 0
			},
			IN_CAM: {
				muted: false,
				description: 'remote camera',
				codec: '',
				framerate: 0,
				bytesReceived: 0,
				packetsLost: 0,
				packetsReceived: 0
			},
			timestamp : new Date().getTime()
		};

		stat.IN_MIC.bytesReceived = items.inbound_rtp_audio_1.bytesReceived;
		stat.IN_MIC.packetsReceived = items.inbound_rtp_audio_1.packetsReceived;
		stat.IN_MIC.packetsLost = items.inbound_rtp_audio_1.packetsLost;

		if("outbound_rtp_audio_-1" in items) {
			stat.OUT_MIC.bytesSent = items["outbound_rtp_audio_-1"].bytesSent;
			stat.OUT_MIC.packetsLost = items["outbound_rtp_audio_-1"].packetsLost || 0;			
		}
		else {
			logger.log(LOG_ID, "No outbound info for audio");
		}

		if("inbound_rtp_video_2" in items) {
			stat.IN_CAM.bytesReceived = items.inbound_rtp_video_2.bytesReceived;
			stat.IN_CAM.packetsReceived = items.inbound_rtp_video_2.packetsReceived;
			stat.IN_CAM.packetsLost = items.inbound_rtp_video_2.packetsLost;	
			stat.IN_CAM.framerate = Math.floor(items.inbound_rtp_video_2.framerateMean);
		}
		else {
			logger.log(LOG_ID, "No inbound info for video");	
		}

		if("outbound_rtp_video_-1" in items) {
			stat.OUT_CAM.bytesSent = items["outbound_rtp_video_-1"].bytesSent;
			stat.OUT_CAM.packetsLost = items["outbound_rtp_video_-1"].packetsLost || 0;		
		}
		else {
			logger.log(LOG_ID, "No Outbound info for video");	
		}
		

		return (stat);	
	}


};

});

require.register("sonotone/rtc/peerConnection", function(exports, require, module) {
/**
 * PeerConnection
 * Represents a WEBRTC PeerConnection Object
 * By default the PeerConnection embeds a DataChannel 'data'
 * It can have an associated video stream 'video' or a screen stream 'screen'
 */

var adapter = require('../others/adapter'),
    logger = require('../others/log'),
    config = require('../others/configuration'),
    capabilities = require('../others/capabilities'),
    Events = require('../others/event'),
    sdpSwapper = require('../others/sdp'),
    statAdapter = require('../others/stat');

var LOG_ID = 'PEERCONNECTION';

/**
* Merge media constraints
*
* @api private
*/

var mergeConstraints = function mergeConstraints(cons1, cons2) {
    var merged = cons1;
    for (var name in cons2.mandatory) {
      merged.mandatory[name] = cons2.mandatory[name];
    }
    merged.optional.concat(cons2.optional);
    return merged;
};

/**
 * Callback for ICECandidate
 */

var onICECandidate = function onICECandidate(event) {
    if(event.candidate) {
        logger.log(LOG_ID, "Get local ICE CANDIDATE from PEER CONNECTION <" + this._id + ">", event);
        this._events.trigger('onICECandiateReceived', event);
    }
    else {
        logger.log(LOG_ID, "No more local candidate to PEER CONNECTION <" + this._id + ">", event);
        //Todo send SDP
        var msg = {
            // data: {
            //     type: 'offer',
            //     sdp: that.getLocalDescription().sdp
            // }, 
            // caller: Sonotone.ID,
            // callee:  that._id.substring(1),
            // media: that._media,
            // channel: false,
            // muted: false
        };
        this._events.trigger("onICECandidateEnd", msg);
    }
};

var onAddStream = function onAddStream(event) {
    logger.log(LOG_ID, "Remote stream added from PEER CONNECTION <" + this._id + ">", event);
    this._stream = event.stream;
    this._events.trigger('onRemoteStreamReceived', {media: this._media, stream: event.stream});
};

var onRemoveStream = function onRemoveStream(event) {
    logger.log(LOG_ID, "Remote stream removed from PEER CONNECTION <" + this._id + ">");
};

var onICEConnectionStateChange = function onICEConnectionStateChange(event) {
    var state = event.target.iceConnectionState;
    logger.log(LOG_ID, "On Ice Connection state changes to " + state + " for PEER CONNECTION <" + this._id + ">", event);
    
    switch (state) {
        case 'connected':
            this._events.trigger('onICEConnected', event);
            break;
        case 'completed':
            this._events.trigger('onICECompleted', event);
            break;
        case 'disconnected':
            this._events.trigger('onICEDisconnected', event);
            this.close();
            this.stopStat();
            break;
        case 'closed':
            this._events.trigger('onICEClosed', event);
            break; 
        case 'failed':
            this._events.trigger('onICEFailed', event);
            break;
    }
};

var onNegotiationNeeded = function onNegotiationNeeded(event) {
    logger.log(LOG_ID, "On negotiation needed for PEER CONNECTION <" + this._id + ">", event);
};

var onSignalingStateChange = function onSignalingStateChange(event) {
    var signalingState = "";
    if(event.target) {
        signalingState = event.target.signalingState;
    }
    else if(event.currentTarget) {
        signalingState = event.currentTarget.signalingState;
    }
    else {
        signalingState = event;
    }
    logger.log(LOG_ID, "On signaling state changes to " + signalingState + " for PEER CONNECTION <" + this._id + ">", event);
};

var onClosedConnection = function onClosedConnection(event) {
    logger.log(LOG_ID, "Connection closed for PEER CONNECTION <" + this._id + ">", event);
};

var onConnection = function onConnection(event) {
    logger.log(LOG_ID, "Connection opened for PEER CONNECTION <" + this._id + ">", event);
};

var onOpen = function onOpen(event) {
    logger.log(LOG_ID, "On Open for PEER CONNECTION <" + this._id + ">", event);
};

var onDataChannel = function onDataChannel(event) {
    logger.log(LOG_ID, "Received Data Channel from <" + this._id + ">", event);
};

/**
 * Constructor
 * @param {String} media Should be video or screen
 * @param {String} id  The ID of the peer
 */

function PeerConnection(media, id) {
    this._media = media || 'video';

    this._id = this._media.substring(0,1) + (id || '' + new Date().getTime());

    this._peerID =id;

    this.offerPending = false;

    this._isCaller = false;

    this._isConnected = false;

    this._answerCreated = false;

    this._tmpICE = [];

    this._events = new Events();

    this._stream = null;

    this._statID = -1;

    logger.log(LOG_ID, 'Create new PeerConnection <' + this._id + '>');

    var peerConnectionConstraints = {
        optional: [
            {googIPv6: true},
            {googImprovedWifiBwe: true},
            {googScreencastMinBitrate: 400}
        ]
    };

    this._peer = adapter.RTCPeerConnection(config.getICEConfiguration(), peerConnectionConstraints);    

    if(this._peer) {

        logger.log(LOG_ID, 'PeerConnection created for <' + this._id + '>', this._peer);

        this._peer.onicecandidate = onICECandidate.bind(this);
        this._peer.onaddstream = onAddStream.bind(this);
        this._peer.onremovestream = onRemoveStream.bind(this);
        this._peer.oniceconnectionstatechange = onICEConnectionStateChange.bind(this);
        this._peer.onnegotiationneeded = onNegotiationNeeded.bind(this);
        this._peer.onsignalingstatechange = onSignalingStateChange.bind(this);
        this._peer.onclosedconnection = onClosedConnection.bind(this);
        this._peer.onconnection = onConnection.bind(this);
        this._peer.onopen = onOpen.bind(this);
        this._peer.ondatachannel = onDataChannel.bind(this);
    }
    else {
        logger.log(LOG_ID, 'PeerConnection failed for <' + this._id + '>');
    }
}

/**
 * ID of the Peer Connection
 *
 * @api public
 */

PeerConnection.prototype.ID = function(id) {
    if(id !== undefined && id !== null) {
        this._peerID = id;
        this._id = this._media.substring(0,1) + id;
    }
    return this._peerID;
};

/**
 * Get the media of this peerConnection
 */

PeerConnection.prototype.media = function() {
    return this._media;
};

/**
 * Get the PeerConnection 
 *
 * @api public
 */

PeerConnection.prototype.peerConnection = function() {
    return this._peer;
};

/**
 * Attach a MediaStream to a peer
 * @param {Object} stream The MediaStream to add
 */

PeerConnection.prototype.attach = function(stream) {
    logger.log(LOG_ID, "Attach a stream to the Peer Connection <" + this._id + ">");

    if(!stream) {
        logger.log(LOG_ID, "No stream to add to the Peer Connection <" + this._id + ">");
        return "no_stream_to_attach";
    }

    var streams = this._peer.getLocalStreams(),
        alreadyAdded = false;
        
    for (var i=0;i< streams.length;i++) {
        if(streams[i].id === stream.id) {
            alreadyAdded = true;
        }
    }

    this._streamForcedDetached = false;

    //As getStreamById is not yet implemented in Firefox, we should use the getLocalStreams method
    //if(this._peer.getStreamById(stream.id) == null) {
    if(!alreadyAdded) {
        this._peer.addStream(stream);
    }
    else {
        logger.log(LOG_ID, "Stream already added to the Peer Connection <" + this._id + ">");
    }
};


/**
 * Create an offer for calling an other peer
 * @param {String} audioCodec 'g711', 'opus' or default order of browser if null
 * @param {String} videoCodec 'vp8' or 'h264' or default order of browser if null 
 */

PeerConnection.prototype.createOffer = function(audioCodec, videoCodec) {

    logger.log(LOG_ID, "Try to create an offer for <" + this._id + ">...");

    if(!this.offerPending) {

        var sdpConstraints = {
            'mandatory': {
                'OfferToReceiveAudio': this._media === 'screen' ? false : true,
                'OfferToReceiveVideo': this._media === 'screen' ? false : true 
            }
        };

        this._isCaller = true;

        this.offerPending = true;

        var muted = false;

        var offerConstraints = {"optional": [], "mandatory": {}};

        var constraints = mergeConstraints(offerConstraints, sdpConstraints);

        logger.log(LOG_ID, "Create the SDP offer for Peer Connection <" + this._id + ">", constraints);

        var that = this;

        this._peer.createOffer(function(offerSDP) {

            // if(fct) {
            //     switch (fct.action) {
            //         case 'mute':
            //             offerSDP = that.muteSDP(offerSDP);
            //             muted = true;
            //             break;
            //         case 'unmute':
            //             offerSDP = that.unmuteSDP(offerSDP);
            //             break;
            //         default:
            //             break;
            //     }
            // }

            if(audioCodec === 'g711') {
                offerSDP.sdp = sdpSwapper.forceG711(offerSDP.sdp);
                logger.log(LOG_ID, "SDP forced to G711", offerSDP.sdp);    
            }

            if(videoCodec === 'h264') {
                offerSDP.sdp = sdpSwapper.forceH264(offerSDP.sdp);
                logger.log(LOG_ID, "SDP forced to H264", offerSDP.sdp);
            }

            var sdpMedia = sdpSwapper.getMediaInSDP(offerSDP.sdp);
            that._events.trigger('onSDPLocalMediaUsed', sdpMedia);

            logger.log(LOG_ID, "Set the SDP to local description for <" + that._id + ">", offerSDP);
            //offerSDP.sdp = preferOpus(offerSDP.sdp);
            that.setLocalDescription(offerSDP);
            
            var event = {
                data: offerSDP,
                caller: capabilities.ID(),
                callee:  that._peerID,
                media: that._media,
                muted: muted
            };

            that.offerPending = false;

            that._events.trigger('onSDPOfferToSend', event);

        }, function(error) {
            logger.log(LOG_ID, "Fail to create Offer for Peer Connection <" + that._id + ">", error);
            that.offerPending = false;
        }, constraints);

    }
};

PeerConnection.prototype.createAnswer = function(media, candidates) {

    logger.log(LOG_ID, "Try to create an answer for <" + this._id + ">...");

    var sdpConstraints = {
        'mandatory': {
            'OfferToReceiveAudio': true,
            'OfferToReceiveVideo': true
        }
    };
                
    var that = this;

    this._isCaller = false;

    if(media === 'data') {
        sdpConstraints = null;
    }
                
    this._peer.createAnswer(function(answerSDP) {
        //answerSDP.sdp = preferOpus(answerSDP.sdp);
        that.setLocalDescription(answerSDP);
                  
        logger.log(LOG_ID, "Send this SDP answer to the remote peer <" + that._id + ">");

        var event = {
            data: answerSDP,
            caller: capabilities.ID(),
            callee: that._peerID,
            media: media
        };

        that._events.trigger('onSDPAnswerToSend', event);

        var sdpMedia = sdpSwapper.getMediaInSDP(answerSDP.sdp);
        var audioCodec = sdpSwapper.getFirstAudioCodec(answerSDP.sdp),
            videoCodec = sdpSwapper.getFirstVideoCodec(answerSDP.sdp);

        that._events.trigger('onSDPLocalMediaUsed', sdpMedia);
        that._events.trigger('onSDPCodecsNegotiated', {audio: audioCodec, video: videoCodec});

        if(candidates) {
            while(candidates.length > 0) {
                that.addCandidate(candidates.pop());
            }    
        }

    }, function(error) {
        logger.log(LOG_ID, "Fail to create Answer for Peer Connection <" + that._id + ">", error);
    }, sdpConstraints);

    this._answerCreated = true;
};

PeerConnection.prototype.addCandidate = function(candidate) {
    
    var ICE = adapter.RTCIceCandidate({sdpMLineIndex:candidate.label, candidate:candidate.candidate, id: candidate.sdpMid});
    if(this._answerCreated || this._isCaller) {
        
        if(!this._isConnected) {
            logger.log(LOG_ID, "Add ICE CANDIDATE to the Peer Connection <" + this._id + ">", candidate);
            this._peer.addIceCandidate(ICE);    
        }
        else {
            logger.log(LOG_ID, "DO not add ICE CANDIDATE because to already connected Peer Connection <" + this._id + ">");
        }
    }
    else {
        logger.log(LOG_ID, "ANSWER not yet created. Postpone ICE for Peer Connection <" + this._id + ">");
        this._tmpICE.push(ICE);
    }
};

PeerConnection.prototype.addEarlyCandidates = function() {

    if(this._tmpICE !== null && this._tmpICE.length > 0) {

        logger.log(LOG_ID, "Add previously stored ICE Candidate to Peer Connection <" + this._id + ">");

        while(this._tmpICE.length > 0) {
            var ICE = this._tmpICE.pop();
            this.addCandidate(ICE);
        }
    }
    else {
        logger.log(LOG_ID, "All Candidates have been added to Peer Connection <" + this._id + ">");
    }

};

/**
 * Store the SDP into the Local Description of the peer
 * @param {Objet} SDP The JSON SDP message
 *
 * @api public
 */

PeerConnection.prototype.setRemoteDescription = function(SDP) {
    logger.log(LOG_ID, "Store the SDP parameters to the remote description of Peer Connection <" + this._id + ">");
    this._peer.setRemoteDescription(SDP);

    var sdpMedia = sdpSwapper.getMediaInSDP(SDP.sdp);
    this._events.trigger('onSDPRemoteMediaUsed', sdpMedia);

    var audioCodec = sdpSwapper.getFirstAudioCodec(SDP.sdp),
        videoCodec = sdpSwapper.getFirstVideoCodec(SDP.sdp);

    this._events.trigger('onSDPCodecsNegotiated', {audio: audioCodec, video: videoCodec});
};

/**
 * Store the SDP into the Local Description of the peer
 * @param {Objet} SDP The JSON SDP message
 *
 * @api public
 */

PeerConnection.prototype.setLocalDescription = function(SDP) {
    logger.log(LOG_ID, "Store the SDP parameters to the local description of Peer Connection <" + this._id + ">");
    this._peer.setLocalDescription(SDP);
};

/**
 * Get the local description
 */

PeerConnection.prototype.getLocalDescription = function() {
    if(this._peer) {
        return this._peer.localDescription;    
    }
    else {
        return null;
    }
    
};

/**
 * True if this peerConnection has initialized the call
 */

PeerConnection.prototype.amICaller = function() {
    return this._isCaller;
};

PeerConnection.prototype.isConnected = function() {
    return this._isConnected;
};

/**
 * Subscribe to Local Media events
 * @param {String} eventName The event to subscribe
 * @param {Function} callbackFunction The function to call
 * @param {Object} context The context to use when calling the callback function
 *
 * @api public
 */

PeerConnection.prototype.on = function(eventName, callbackFunction, context) {
   this._events.on(eventName, callbackFunction, context);
};

/**
 * Unsubscribe to IO events
 * @param {String} eventName The event to unsubscribe
 * @param {Function} callbackFunction The registered callback
 *
 * @api public
 */    

PeerConnection.prototype.off = function(eventName, callbackFunction) {
    this._events.off(eventName, callbackFunction);
};

/**
 * Test function only
 */

PeerConnection.prototype._onICECandidate = function(event) {
    onICECandidate.call(this, event);
};

PeerConnection.prototype.close = function() {
    logger.log(LOG_ID, "Close the Peer Connection <" + this._id + ">");
    if(this._peer) {
        this._peer.close();
        this._peer = null;
    }
};

PeerConnection.prototype.activateStat = function(interval) {

    if(!this._peer) {
        logger.log(LOG_ID, "Error, can't activate stat. No Peer Connection");
        return;
    }

    var that = this;

    var stat = null;

    if(this._statID === -1) {
        
        this._statID = setInterval(function() {
        
            if (!!navigator.mozGetUserMedia) {
                that._peer.getStats(that._stream.getVideoTracks[0], function(res){

                    stat = statAdapter.firefoxStat(res);

                    logger.log(LOG_ID, "Firefox getStats", stat);

                    that._events.trigger('onStat', stat);

                }, function(error) {
                    console.log("ERROR");
                });
            }
            else {
                that._peer.getStats(function (res) {
                    var items = [];
                    res.result().forEach(function (result) {
                        var item = {};
                        result.names().forEach(function (name) {
                            item[name] = result.stat(name);
                        });
                        item.id = result.id;
                        item.type = result.type;
                        item.timestamp = result.timestamp;
                        items.push(item);
                    });
                    stat = statAdapter.chromeStat(items);

                    logger.log(LOG_ID, "Chrome getStats", stat);

                    that._events.trigger('onStat', stat);
                });    
            }

        }, interval);
    }
};

PeerConnection.prototype.stopStat = function() {
    if(this._statID > -1) {
        clearInterval(this._statID);
    }
};

module.exports = PeerConnection;


});

require.register("sonotone/stream/localMedia", function(exports, require, module) {
var logger = require('../others/log'),
    adapter = require('../others/adapter'),
    Events = require('../others/event'),
    Stream = require('./stream');

var LOG_ID = 'LOCALMEDIA';

var isScreenCaptured = false,
    isCameraCaptured = false;

var streamCamera = null,
    streamScreen = null;

var events = new Events();
var mediaStream = null; 

var HTMLCamera = null;

var quality = {
    'qqvga' :   {maxWidth: 160, maxHeight: 120, minWidth: 160, minHeight: 120},       //4:3
    'qcif'  :   {maxWidth: 176, maxHeight: 144, minWidth: 176, minHeight: 144},       //4:3
    'qvga'  :   {maxWidth: 320, maxHeight: 240, minWidth: 320, minHeight: 240},       //4:3
    'cif'   :   {maxWidth: 352, maxHeight: 288, minWidth: 352, minHeight: 288},       //4:3
    'vga'   :   {maxWidth: 640, maxHeight: 480, minWidth: 640, minHeight: 480},       //4:3
    'svga'  :   {maxWidth: 800, maxHeight: 600, minWidth: 800, minHeight: 600},       //4:3
    'cam'   :   {maxWidth: 960, maxHeight: 720, minWidth: 960, minHeight: 720},       //4:3
    '720p'  :   {maxWidth: 1280, maxHeight: 720, minWidth: 1280, minHeight: 720},     //16:9
    'uxga'  :   {maxWidth: 1600, maxHeight: 1200, minWidth: 1600, minHeight: 1200},   //4:3
    '1080p' :   {maxWidth: 1920, maxHeight: 1080, minWidth: 1920, minHeight: 1080},   //16:9 
    '4k'    :   {maxWidth: 3840, maxHeight: 2160, minWidth: 3840, minHeight: 2160}    //16:9 
};

var default_quality = {maxWidth: 320, maxHeight: 240};

/* -------------------------------- Private functions --------------------------- */

var _getMediaConstraints = function _getMediaConstraints(audio, video, format) {
        
    var mediaConstraints = {
        audio: {
            mandatory: {
            },
            optional: [
                {echoCancelation: true},
                {googEchoCancellation: true},
                {googEchoCancellation2: true},
                {googAutoGainControl: true},
                {googAutoGainControl2: true},
                {googNoiseSupression: true},
                {googNoisesuppression2: true},
                {googHighpassFilter: true},
                {googTypingNoiseDetection: true},
                {googAudioMirroring:false}
            ]
        }
    };

    if(audio.source.length > 0) {
        mediaConstraints.audio.optional.push({sourceId: audio.source});
    }

    if (video.media) {
        //Add th video constraints if needed
        mediaConstraints.video = {
            mandatory: format,
            optional: [
                // {googLeakyBucket: true},
                // {googNoiseReduction: true}
            ]
        };

        if(video.source.length > 0) {
            mediaConstraints.video.optional.push({sourceId: video.source});
        }
    }
    return mediaConstraints;
};

/* -------------------------------- Public functions --------------------------- */

logger.log(LOG_ID, "Module started...");

module.exports = {

    /**
     * Start accessing to the local Media
     * @param {Boolean} withAudio True to have audio enabled
     * @param {Boolean} withVideo True to have video enabled
     * @param {String} Video Quality or null/undefined for audio only
     *
     * @api public
     */

    acquire: function(audioProfile, videoProfile, format) {

        var qualityAsked = default_quality;
        
        if(format && format in quality) {
            qualityAsked = quality[format];
        }

        if(videoProfile.media) {
            logger.log(LOG_ID, 'Ask for camera', {audio: audioProfile.media, audioSource: audioProfile.source, video: videoProfile.media, videoSource: videoProfile.source, name: format, quality: qualityAsked});    
        }
        else {
            logger.log(LOG_ID, 'Ask for camera', {audio: audioProfile.media, audioSource: audioProfile.source}); 
        }

        var constraints = _getMediaConstraints(audioProfile, videoProfile, qualityAsked);

        logger.log(LOG_ID, "Local constraints asked", constraints);

        adapter.getUserMedia(constraints, function(stream) {
            logger.log(LOG_ID, "User has granted access to local media - Camera", stream);
            streamCamera = stream;
            mediaStream = new Stream(stream, "video", "local");
            mediaStream.on('onLocalVideoStreamEnded', function(json) {
                events.trigger('onLocalVideoStreamEnded', json);
            }, this);
            isCameraCaptured = true;
            events.trigger('onLocalVideoStreamStarted', {media: 'video', stream: stream});
        }, function(err) {
            logger.log(LOG_ID, 'Failed to get access to local media', err);
            streamCamera = null;
            isCameraCaptured = false;
            events.trigger('onLocalVideoStreamError', {code: 1, message:"", name: "PERMISSION_DENIED"});
        }, this);
    },

    /**
     * Release the camera stream
     */

    releaseCamera: function() {
        if(!isCameraCaptured) {
            logger.log(LOG_ID, 'No stream to release');
            return;
        }

        mediaStream.stop();
    },

    /**
     * Is a screen stream captured and ready to be sent
     *
     * @api public
     */

    isScreenCaptured: function() {
        return isScreenCaptured;
    },

    /**
     * Is a camera stream captured and ready to be sent
     *
     * @api public
     */

    isCameraCaptured: function() {
        return isCameraCaptured;
    },

    /**
     * Get the Local Video Stream
     *
     * @api public
     */

    streamCamera: function(camera) {
        if(camera) {
            streamCamera = camera;
            isCameraCaptured = true;
        }
        return streamCamera;
    },

    /**
     * Get the Local Video Stream
     *
     * @api public
     */

    streamScreen: function(screen) {
        if(screen) {
            streamScreen = screen;
            isScreenCaptured = true;
        }
        return streamScreen;
    },

    /**
     * Attach the Local video stream to a <video> or <canvas> element
     *
     * @api public
     */

    renderCameraStream: function(HTMLMediaElement) {
        logger.log(LOG_ID, "Render the Camera stream", HTMLMediaElement); 

        var that = this;

        HTMLMediaElement.onplay = function() {
            var ratio = adapter.getVideoRatio(HTMLMediaElement);
            logger.log(LOG_ID, "Video ratio detected", ratio);
            HTMLMediaElement.onplay = null;
        };

        HTMLMediaElement.onended = function() {
            logger.log("LOG_ID", "Video ended detected");
            //ACK: FF doesn't detect MediaTrack end (MAC, Win too ?)
            events.trigger('onLocalVideoStreamEnded', {stream: streamCamera});
        };

        if(streamCamera) {
            HTMLCamera = adapter.attachToMedia(HTMLMediaElement, streamCamera);
            return HTMLCamera;    
        }
        else {
            logger.log(LOG_ID, "No stream to render");
            return null;
        }
    },

    /**
     * Subscribe to Local Media events
     * @param {String} eventName The event to subscribe
     * @param {Function} callbackFunction The function to call
     * @param {Object} context The context to use when calling the callback function
     *
     * @api public
     */

    on: function(eventName, callbackFunction, context) {
       events.on(eventName, callbackFunction, context);
    },

    /**
     * Unsubscribe to IO events
     * @param {String} eventName The event to unsubscribe
     * @param {Function} callbackFunction The registered callback
     *
     * @api public
     */    

    off: function(eventName, callbackFunction) {
        events.off(eventName, callbackFunction);
    },

    _setAdapter: function(adp) {
        adapter = adp;
    }
};
});

require.register("sonotone/stream/remoteMedia", function(exports, require, module) {
/**
 * RemoteMedia
 * Represents a Remove Media that can be comes from the Camera, the screen/App sharing or a remote peer
 */

var adapter = require('../others/adapter'),
    logger = require('../others/log'),
    Events = require('../others/event'),
    Stream = require('./stream');

var LOG_ID = 'RemoteMedia';

function RemoteMedia(stream, media) {
    this._events = new Events();
    this._media = media;
    this._mediaStream = new Stream(stream, media, "remote"); 
    this._mediaStream.on('onRemoteVideoStreamEnded', function(json) {
        this._events.trigger('onRemoteVideoStreamEnded', json);
    }, this);
}

RemoteMedia.prototype.on = function(eventName, callbackFunction, context) {
    this._events.on(eventName, callbackFunction, context);
};

RemoteMedia.prototype.off = function(eventName, callbackFunction) {
    this._events.off(eventName, callbackFunction);
};

RemoteMedia.prototype.renderStream = function(HTMLMediaElement) {
    logger.log(LOG_ID, "Render a Remote Stream", HTMLMediaElement); 

    var that = this;

    HTMLMediaElement.onplay = function() {
        var ratio = adapter.getVideoRatio(HTMLMediaElement);
        logger.log(LOG_ID, "Video ratio received", ratio);
        HTMLMediaElement.onplay = null;
    };

    var stream = this._mediaStream.get();

    if(stream) {
        HTMLCamera = adapter.attachToMedia(HTMLMediaElement, stream);
        return HTMLCamera;    
    }
    else {
        logger.log(LOG_ID, "No stream to render");
        return null;
    }
};

module.exports = RemoteMedia;
});

require.register("sonotone/stream/source", function(exports, require, module) {
var logger = require('../others/log'),
    Events = require('../others/event');

var LOG_ID = 'SOURCE';

logger.log(LOG_ID, "Module started...");

module.exports = {

    getAudioSources: function(callback, context) {

        logger.log(LOG_ID, "Try to get the list of Audio sources");

        if (typeof MediaStreamTrack === 'undefined' || typeof MediaStreamTrack.getSources === 'undefined') {
            logger.log(LOG_ID, "No access to audio sources. Use default");
            callback.call(context, []);
        }
        else {
            MediaStreamTrack.getSources(function(sourceInfos) {
            
                var sources = [];
                logger.log(LOG_ID, "Sources found", sourceInfos);

                for (var i = 0; i !== sourceInfos.length; ++i) {
                    var sourceInfo = sourceInfos[i];
                    if (sourceInfo.kind === 'audio') {
                        sources.push({id: sourceInfos[i].id, label: sourceInfos[i].label});
                    }
                }
                
                logger.log(LOG_ID, "Audio sources found", sources);

                callback.call(context, sources);
            });    
        }
    },

    getVideoSources: function(callback, context) {

        logger.log(LOG_ID, "Try to get the list of Video sources");

        if (typeof MediaStreamTrack === 'undefined' || typeof MediaStreamTrack.getSources === 'undefined') {
            logger.log(LOG_ID, "No access to video sources. Use default");
            callback.call(context, []);
        }
        else {
            MediaStreamTrack.getSources(function(sourceInfos) {
            
                var sources = [];
                logger.log(LOG_ID, "Sources found", sourceInfos);

                for (var i = 0; i !== sourceInfos.length; ++i) {
                    var sourceInfo = sourceInfos[i];
                    if (sourceInfo.kind === 'video') {
                        sources.push({id: sourceInfos[i].id, label: sourceInfos[i].label});
                    }
                }
                
                logger.log(LOG_ID, "Video sources found", sources);

                callback.call(context, sources);
            });    
        }
    },

};
});

require.register("sonotone/stream/stream", function(exports, require, module) {
/**
 * Stream
 * Represents a STREAM that can be comes from the Camera, the screen/App sharing or a remote peer
 * A stream can contain several tracks
 */

var adapter = require('../others/adapter'),
    logger = require('../others/log'),
    Events = require('../others/event');

var LOG_ID = 'STREAM';

function Stream(stream, media, type) {
    var that = this;

    this._videoTrack = null;
    this._audioTrack = null;
    this._stream = stream  || null;
    this._type = type || "local";
    this._media = media || "video";
    this._events = new Events();
    this._id = this._stream ? (this._stream.id ? this._stream.id : new Date().getTime()) : new Date().getTime();
    
    logger.log(LOG_ID, 'Create a new Stream', {id: this._id, mediastream: this._stream, type: type, media: media});

    if(this._stream) {
        // Subscribe to stream events
        this._stream.onaddtrack = function(track) {
            logger.log(LOG_ID, 'Track added from MediaStream ' + that._stream.id, track);
        };  

        this._stream.onremovetrack = function(track) {
            logger.log(LOG_ID, 'Track removed to MediaStream ' + that._stream.id, track);
        };

        this._stream.onended = function() {
            if(that._type === 'local') {
                logger.log(LOG_ID, 'Local MediaStream has ended', that._stream);
                that._events.trigger('onLocalVideoStreamEnded', {stream: that._stream});    
            }
            else {
                logger.log(LOG_ID, 'Remote MediaStream has ended', that._stream);
                that._events.trigger('onRemoteVideoStreamEnded', {stream: that._stream});    
            }
        };
        
        var videoTracks = adapter.getVideoTracks(this._stream);
        var audioTracks = adapter.getAudioTracks(this._stream);
        if(videoTracks.length > 0) {
            this._videoTrack = videoTracks[0];
            
            // Subscribe to track events for video track
            this._videoTrack.onended = function(event) {
                logger.log(LOG_ID, 'Video Track has ended', event.target);
            };

            this._videoTrack.onmute = function(event) {
                logger.log(LOG_ID, 'Video Track has been muted', event.target);
            };

            this._videoTrack.onunmute = function(event) {
                logger.log(LOG_ID, 'Video Track has been unmuted', event.target);
            };

            logger.log(LOG_ID, 'With a VideoTrack', this._videoTrack);
        }
        else {
            logger.log(LOG_ID, "Without a VideoTrack");
        }
        if(audioTracks.length > 0) {
            this._audioTrack = audioTracks[0];
            
            // Subscribe to track events for audio track
            this._audioTrack.onended = function(event) {
                logger.log(LOG_ID, 'Audio Track has ended', event.target);
            };

            this._audioTrack.onmute = function(event) {
                logger.log(LOG_ID, 'Audio Track has been muted', event.target);
            };

            this._audioTrack.onunmute = function(event) {
                logger.log(LOG_ID, 'Audio Track has been unmuted', event.target);
            };

            logger.log(LOG_ID, 'With an AudioTrack', this._audioTrack);
        }
        else {
            logger.log(LOG_ID, "Without an AudioTrack");
        }
    }
}

Stream.prototype.getMedia = function() {
    return this._media;
};

Stream.prototype.getType = function() {
    return this._type;
};

Stream.prototype.get = function() {
    return(this._stream);
};

Stream.prototype.getVideoTrack = function() {
    return (this._videoTrack);
};

Stream.prototype.getAudioTrack = function() {
    return (this._audioTrack);
};

Stream.prototype.ID = function() {
    return (this._id);
};

Stream.prototype.on = function(eventName, callbackFunction, context) {
    this._events.on(eventName, callbackFunction, context);
};

Stream.prototype.off = function(eventName, callbackFunction) {
    this._events.off(eventName, callbackFunction);
};

Stream.prototype.stop = function() {
    var _FFFix = false;

    logger.log(LOG_ID, 'Try to stop the stream <' + this._id + '>');

    if(this._videoTrack) {
                
        if (typeof this._videoTrack.stop === 'function') { 
            logger.log(LOG_ID, 'Stop the video track <' + this._videoTrack.id + '>');
            this._videoTrack.stop(); 
        }
        else {
            _FFFix = true;
        }
        
    }

    if(this._audioTrack) {
        
        if (typeof this._audioTrack.stop === 'function') {
            logger.log(LOG_ID, 'Stop the audio track <' + this._audioTrack.id + '>');
            this._audioTrack.stop();
        }
        else {
            _FFFix = true;
        }
    }

    if(_FFFix) {
        logger.log(LOG_ID, 'Stop the stream <' + this._id + '>');
        this._stream.stop();    
    }
    
};

module.exports = Stream;


});

require.register("sonotone/transport/websocket", function(exports, require, module) {

var LOG_ID = 'WEBSOCKET';

var logger = require('../others/log');
var Events = require('../others/event');
var capabilities = require('../others/capabilities');

var protocol = 'ws://';

var socket = null;

var room = null;

var caps = capabilities.caps();
var events = new Events();

var transportReady = false;

var onOpen = function onOpen() {
    logger.log(LOG_ID, "<--- OK");
    transportReady = true;
    logger.log(LOG_ID, "</-- onTransportReady", null);
    events.trigger('onTransportReady', null);
};

var onMessage = function onMessage(msg) {

    var message = null;

    var unknownMessage = false;

    if(msg.data && typeof msg.data === 'string') {

        try {
            message = JSON.parse(msg.data);  
            if(message.data && message.data.type) {
                logger.log(LOG_ID, "<--- " + message.data.type, message);
                events.trigger('onTransportMessage', message);    
            }  
            else {
                unknownMessage = true;
            }
        }
        catch (err) {
            logger.log(LOG_ID, "Error", err);
            unknownMessage = true;
        }
    }
    else {
        unknownMessage = true;
    }

    if(unknownMessage) {
        logger.log(LOG_ID, "</-- onTransportUnknownMessage", msg);
        events.trigger('onTransportUnknownMessage', msg);
    }
};

var onClosed = function onClosed() {
    logger.log(LOG_ID, "<--- !!!Warning, Channel Closed");
    transportReady = false;
    logger.log(LOG_ID, "</-- onTransportClosed", null);
    events.trigger('onTransportClosed', null);
};

var onError = function onError(err) {
    logger.log(LOG_ID, "<--- !!!Error, error message received");
    transportReady = false;
    logger.log(LOG_ID, "</-- onTransportError", null);
    events.trigger('onTransportError', err);
};

logger.log(LOG_ID, "Module started...");

module.exports = {

    /**
     * Transport type
     */

    name: function() {
        return "websocket";
    },

    /**
     * Connect the Transport
     * @param {Object} config The server configuration (host, port)
     * @param {Object} data The user capabilities that have to be transmitted to others peers (nickname, audio/video capabilities...)
     * @param {String} code, The conference code (room)
     *
     * @api public
     */

    connect: function(config) {

        if(config && config.host) {
            logger.log(LOG_ID, "---> Connect", config);

            if(config.secure) {
                protocol = 'wss://';
            }

            if(!socket) {
            
                if(config.port) {
                    socket = new WebSocket(protocol + config.host + ":" + config.port);
                }
                else {
                    socket = new WebSocket(protocol + config.host);
                }

                socket.onopen = function(msg) {
                    onOpen(msg);
                };

                socket.onmessage = function(msg) {
                    onMessage(msg);
                };

                socket.onclose = function() {
                    onClosed();
                };

                socket.onerror = function(err) {
                    onError(err);
                };
            }
        }
        else {
            logger.log(LOG_ID, "No server configuration. Connection aborded");
            events.trigger('onTransportError', null);
        }
    },

    /**
     * Send a message using the Transport
     *
     * @api public
     */

    send: function(JSONMessage) {
        if(transportReady) {
            if(room) {
                JSONMessage.room = room;    
            }
            var message = JSON.stringify(JSONMessage);
            logger.log(LOG_ID, "---> " + JSONMessage.data.type, JSONMessage);
            socket.send(message);
        }
        else {
             logger.log(LOG_ID, "Not ready!!!", JSONMessage);
        }
    },

    /**
     * Send a welcome message to the server
     *
     * @api privte
     */

    welcome: function() {
        this.send(
            {
                data: {
                    type: 'welcome',
                },
                caller: capabilities.ID(), 
                callee: 'all',
            }
        );
    },

    /**
     * Send a bye message to the server
     */

    bye: function() {
        this.send({
            data: {
                type: 'bye',
            },
            caller: capabilities.ID(),
            callee: 'all'
        });

        transportReady = false;
        socket.close();
        socket = null;
    },

    /**
     * Join a room for discussing
     * Should be the first call to the server (user capabilities)
     *
     * @api public
     */

    join: function(roomID) {

        room = roomID;

        this.send({
            data: {
                type: 'join',
                caps: caps,
                room: roomID,
            },
            caller: capabilities.ID(), 
            callee: 'all',
        });
    },

    /**
     * Exit a current room
     *
     * @api public
     */

    exit: function() {

        if(room) {
            this.send({
                data: {
                    type:'exit',
                    room: room
                },
                caller: capabilities.ID(),
                callee: 'all'
            });
        }
    },

    /**
     * Subscribe to Websocket events
     * @param {String} eventName The event to subscribe
     * @param {Function} callbackFunction The function to call
     * @param {Object} context The context to use when calling the callback function
     *
     * @api public
     */

    on: function(eventName, callbackFunction, context) {
       events.on(eventName, callbackFunction, context);
    },

    /**
     * Unsubscribe to Websockets events
     * @param {String} eventName The event to unsubscribe
     * @param {Function} callbackFunction The registered callback
     *
     * @api public
     */    

    off: function(eventName, callbackFunction) {
        events.off(eventName, callbackFunction);
    },

    isReady: function() {
        return transportReady;
    },

    /** 
     * Testing purpose only
     *
     * @api private
     */
    _onOpen: function() {
        onOpen();
    },

    /** 
     * Testing purpose only
     *
     * @api private
     */
    _onMessage: function(msg) {
        onMessage(msg);
    },

    /** 
     * Testing purpose only
     *
     * @api private
     */
    _onClosed: function() {
        onClosed();
    },

    /** 
     * Testing purpose only
     *
     * @api private
     */
    _onError: function(err) {
        onError(err);
    }


};
});


//# sourceMappingURL=sonotone.js.map