var users = {};
var lastConnected = null;
var isMediaReady = false;
var inCall = false;
var callType = 'full';

var isSecure = false;
var port = '1337';

var sono = require('sonotone/io');

var codecUsed = null;

var graphAudio, graphVideo,
    legendAudio, legendVideo, 
    previousAudioPacketsLost = 0, previousVideoPacketsLost = 0,
    previousAudioPacketsReceived = 0, previousVideoPacketsReceived = 0;
    interval = 3000;

jQuery.fn.extend({
    disable: function(state) {
        return this.each(function() {
            this.disabled = state;
        });
    }
});

$(function() {

    $(window).bind('load', function() {
        console.log("[DEMO] :: Start...");

        // Listener on buttons
        $('.btn-pickvideo').on('click', acquireVideo);
        $('.btn-pickaudio').on('click', acquireAudio);

        $('.btn-startCall').on('click', startCall);
        $('.btn-stopCall').on('click', stopCall);

        $('.btn-pickaudio').tooltip();
        $('.btn-pickvideo').tooltip();
        $('.navbar-participants').tooltip();
        $('.btn-startCall').tooltip();
        $('.btn-stopCall').tooltip();        

        // Audio chart
        graphAudio = new Rickshaw.Graph( {
            element: document.getElementById("chart-audio"),
            width: 600,
            height: 190,
            renderer: 'area',
            series: new Rickshaw.Series.FixedDuration(
                [
                    { name: 'Audio', color: "#30c020" }
                ], undefined, {
                    timeInterval: interval,
                    maxDataPoints: 100,
                    timeBase: new Date().getTime() / 1000
                }
            ) 
        });

        graphAudio.render();

        // Audio chart
        graphVideo = new Rickshaw.Graph( {
            element: document.getElementById("chart-video"),
            width: 600,
            height: 190,
            renderer: 'area',
            series: new Rickshaw.Series.FixedDuration(
                [
                    { name: 'Video', color: "#c05020" }
                ], undefined, {
                    timeInterval: interval,
                    maxDataPoints: 100,
                    timeBase: new Date().getTime() / 1000
                }
            ) 
        });

        graphVideo.render();

        legendAudio = new Rickshaw.Graph.Legend({
            graph: graphAudio,
            element: document.querySelector('#legend-audio')
        });

        legendVideo = new Rickshaw.Graph.Legend({
            graph: graphVideo,
            element: document.querySelector('#legend-video')
        });

        var hoverDetailAudio = new Rickshaw.Graph.HoverDetail( {
            graph: graphAudio
        });

        var hoverDetailVideo = new Rickshaw.Graph.HoverDetail( {
            graph: graphVideo
        });

        var xAxis = new Rickshaw.Graph.Axis.Time({
            graph: graphVideo
        });

        xAxis.render();

        var xAxisAudio = new Rickshaw.Graph.Axis.Time({
            graph: graphAudio
        });

        xAxisAudio.render();

        var yAxis = new Rickshaw.Graph.Axis.Y({
            graph: graphVideo
        });

        yAxis.render();

        var yAxisAudio = new Rickshaw.Graph.Axis.Y({
            graph: graphAudio
        });

        yAxisAudio.render();

    });
});

/* ------------------------ Transport Management -------------------------- */

console.log("protocol", window.location.protocol);
if(window.location.protocol === 'https:') {
    isSecure = true;
    port= '443';
}

//Alcatel
//sono.transport('websocket').connect({host: '172.25.41.180', port: '1337'});
//Home
sono.transport('websocket').connect({host: '192.168.0.126', port: port, secure: isSecure});
//sono.transport('websocket').connect({host: '135.118.76.10', port: '1337'});

sono.transport().on('onTransportReady', onTransportReady, this);
sono.transport().on('onTransportClosed', onTransportClosed, this);
sono.transport().on('onTransportError', onTransportError, this);
sono.on('onJoinAck', onJoinAck, this);

function onTransportReady() {
    sono.transport().join('123456');
};

function onTransportClosed() {
    $('.navbar-participants').text('E');
    $('.navbar-participants').removeClass('quality-good');
    $('.navbar-participants').addClass('quality-bad');
    $('.navbar-participants').removeClass('quality-none');
    $('.navbar-participants').attr('data-original-title', 'Not connected (closed)');
};

function onTransportError(error) {
    $('.navbar-participants').text('E');
    $('.navbar-participants').removeClass('quality-good');
    $('.navbar-participants').addClass('quality-bad');
    $('.navbar-participants').removeClass('quality-none');
    $('.navbar-participants').attr('data-original-title', 'Not connected (error)');
};

function onJoinAck() {
    $('.navbar-participants').text('C');
    $('.navbar-participants').addClass('quality-good');
    $('.navbar-participants').removeClass('quality-bad');
    $('.navbar-participants').removeClass('quality-none');
    $('.navbar-participants').attr('data-original-title', 'Connected');
}

/* ------------------------- Peers Management ----------------------------- */

sono.on('onPeerConnected', onPeerConnected, this);
sono.on('onPeerAlreadyConnected', onPeerConnected, this);
sono.on('onPeerDisconnected', onPeerDisconnected, this);
//sono.on('onPeerIMMessage', onPeerIMMessage, this);
//sono.on('onPeerFileReceived', onPeerFileReceived, this);
sono.on('onPeerCallOffered', onPeerCallOffered, this);
sono.on('onPeerCallAnswered', onPeerCallAnswered, this);
sono.on('onPeerCallVideoStarted', onPeerCallVideoStarted, this);
sono.on('onPeerCallVideoEnded', onPeerCallVideoEnded, this);
sono.on('onPeerEndCall', onPeerEndCall);
sono.on('onPeerStatReceived', onPeerStatReceived);
sono.on('onPeerICEConnected', onPeerICEConnected);
sono.on('onPeerICECompleted', onPeerICECompleted);
sono.on('onPeerICEFailed', onPeerICEFailed);
sono.on('onPeerICEClosed', onPeerICEClosed);
sono.on('onPeerICEDisconnected', onPeerICEDisconnected);
sono.on('onPeerSDPLocalMediaUsed', onPeerSDPLocalMediaUsed);
sono.on('onPeerSDPRemoteMediaUsed', onPeerSDPRemoteMediaUsed);
sono.on('onPeerSDPCodecsNegotiated', onPeerSDPCodecsNegotiated); 

function onPeerConnected(peer) {
    users[peer.ID()] = peer;
    lastConnected = peer;
    console.log("[DEMO] :: New User:" + peer.ID() + " (" + sono.numberOfPeers() + " connected users)");
    $('.btn-pickaudio').disable(false);
    $('.btn-pickvideo').disable(false);
};

function onPeerDisconnected(peer) {
    console.log("DEMO :: User to remove: ", peer.ID());

    delete users[peer.ID()];

    console.log("DEMO :: " + Object.keys(users).length + " users remains");

    sono.stopStat(peer.ID());
    $('.btn-pickaudio').disable(false);
    $('.btn-pickvideo').disable(false);
};

function onPeerCallOffered(data) {
  console.log("DEMO :: Call Offered", data);
  
  if(data.type === 'full') {
    acquireVideo();
  }
  else {
    acquireAudio();
  }

  //sono.call(data.id, data.media);
};

function onPeerCallAnswered(data) {
  console.log("DEMO :: Call answered", data);
  sono.startStat(data.id, 'video', interval);
};

function onPeerICEConnected(data) {
    console.log("DEMO :: SIG CONNECTED", data);
    if(!inCall) {

        if(codecUsed) {
            //$('.webrtc-state').text(codecUsed.audio.toUpperCase() + ' - ' + codecUsed.video.toUpperCase());
        }
        else {
            $('.webrtc-state').text('SIG CONNECTED');        
        }
    }
};

function onPeerICECompleted(data) {
    if(!inCall) {
        console.log("DEMO :: SIG COMPLETED", data);    
    }
};

function onPeerICEFailed(data) {
    console.log("DEMO :: SIG Failed", data);
    $('.webrtc-state').text('FAILED');
};

function onPeerICEClosed(data) {
    console.log("DEMO :: SIG Closed", data);
    $('.webrtc-state').text('CLOSED');
    $('.webrtc-container-remoteVideo').attr('src', '');
};

function onPeerICEDisconnected(data) {
    inCall = false;
    console.log("DEMO :: SIG Disconnected", data);
    $('.webrtc-state').text('DISCONNECTED');  
};

function onPeerEndCall(data) {
    inCall = false;
  console.log("DEMO :: Call ended", data);
  sono.stopStat(data.id);
  $('.webrtc-state').text('FREE');
  stopCall();

  resetLabels();
  codecUsed = null;
  
};

function resetLabels() {
    $('#quality-call-audio').addClass('quality-none');
  $('#quality-call-audio').removeClass('quality-good');
  $('#quality-call-audio').removeClass('quality-bad');
  $('#quality-last-audio').addClass('quality-none');
  $('#quality-last-audio').removeClass('quality-good');
  $('#quality-last-audio').removeClass('quality-bad');
  $('#quality-call-audio').text('-');
  $('#quality-last-audio').text('-');

  $('#quality-call-video').addClass('quality-none');
  $('#quality-call-video').removeClass('quality-good');
  $('#quality-call-video').removeClass('quality-bad');
  $('#quality-last-video').addClass('quality-none');
  $('#quality-last-video').removeClass('quality-good');
  $('#quality-last-video').removeClass('quality-bad');
  $('#quality-call-video').text('-');
  $('#quality-last-video').text('-');

  $('#framerate-video').text('-');
  $('#framerate-video').addClass('quality-none');
  $('#framerate-video').removeClass('quality-good');
  $('#framerate-video').removeClass('quality-bad');
}

function onPeerCallVideoStarted(data) {
    inCall = true;
    console.log("DEMO :: Video received from peer", data);
    sono.remoteMedia(data.id, data.media).renderStream($('.webrtc-container-remoteVideo')[0]);
    sono.startStat(data.id);

    //Change button call to stop
    if(callType === 'audio') {
        $('.btn-pickaudio').removeClass('btn-primary');
        $('.btn-pickaudio').addClass('btn-danger');
        $('.btn-pickaudio').attr('data-original-title', 'End this call');
        $('.btn-pickaudio-icon').removeClass('glyphicon-headphones');
        $('.btn-pickaudio-icon').addClass('glyphicon-phone-alt');

    }
    else {
        $('.btn-pickvideo').removeClass('btn-warning');
        $('.btn-pickvideo').addClass('btn-danger');
        $('.btn-pickvideo').attr('data-original-title', 'End this call');
        $('.btn-pickvideo-icon').removeClass('glyphicon-facetime-video');
        $('.btn-pickvideo-icon').addClass('glyphicon-phone-alt');
    }
};

function onPeerCallVideoEnded(data) {
    inCall = false;  
    console.log("DEMO :: Video ended from peer", data);
    stopCall();
    resetLabels();
    codecUsed = null;
};

function onPeerStatReceived(data) {

    var videoPacketsLost = data.IN_CAM.packetsLost,
        audioPacketsLost = data.IN_MIC.packetsLost,
        videoPacketsReceived = data.IN_CAM.packetsReceived,
        audioPacketsReceived = data.IN_MIC.packetsReceived;

    var audioPacketsSent = data.OUT_MIC.packetsSent;

    var framerate = data.IN_CAM.framerate;

    var videoCallQuality = Math.floor(100 - (videoPacketsLost / videoPacketsReceived * 100));
    var audioCallQuality = Math.floor(100 - (audioPacketsLost / audioPacketsReceived * 100));


    var videoCurrentQuality = 0, audioCurrentQuality = 0;
    if(audioPacketsReceived - previousAudioPacketsReceived === 0) {
        videoCurrentQuality = 0;
        audioCurrentQuality = 0;
    }
    else {
        videoCurrentQuality = Math.floor(100 - ( (videoPacketsLost - previousVideoPacketsLost) / (videoPacketsReceived - previousVideoPacketsReceived) * 100));
        audioCurrentQuality = Math.floor(100 - ( (audioPacketsLost - previousAudioPacketsLost) / (audioPacketsReceived - previousAudioPacketsReceived) * 100));
    }

    var dataAudio = { 
        'Audio': audioPacketsLost - previousAudioPacketsLost
    };

    var dataVideo = { 
        'Video': videoPacketsLost - previousVideoPacketsLost
    };

    previousVideoPacketsLost = videoPacketsLost;
    previousAudioPacketsLost = audioPacketsLost;
    previousVideoPacketsReceived = videoPacketsReceived;
    previousAudioPacketsReceived = audioPacketsReceived;

    graphAudio.series.addData(dataAudio);
    graphAudio.render();

    graphVideo.series.addData(dataVideo);
    graphVideo.render();

    if(audioPacketsReceived > 0) {
        $('#quality-call-audio').text(audioCallQuality + ' %');
        if(audioCallQuality < 80) {
            $('#quality-call-audio').removeClass('quality-good');
            $('#quality-call-audio').removeClass('quality-none');
            $('#quality-call-audio').addClass('quality-bad');
        }
        else {
            $('#quality-call-audio').addClass('quality-good');
            $('#quality-call-audio').removeClass('quality-bad');
            $('#quality-call-audio').removeClass('quality-none');    
        }

        $('#quality-last-audio').text(audioCurrentQuality + ' %');
        if(audioCurrentQuality < 80) {
            $('#quality-last-audio').removeClass('quality-good');
            $('#quality-last-audio').addClass('quality-bad');
            $('#quality-last-audio').removeClass('quality-none');
        }
        else {
            $('#quality-last-audio').addClass('quality-good');
            $('#quality-last-audio').removeClass('quality-bad'); 
            $('#quality-last-audio').removeClass('quality-none');   
        }
    }
    else {
        $('#quality-call-audio').text('-');
        $('#quality-call-audio').addClass('quality-none');
        $('#quality-call-audio').removeClass('quality-bad');
        $('#quality-call-audio').removeClass('quality-good');
        $('#quality-last-audio').text('-');
        $('#quality-last-audio').addClass('quality-none');
        $('#quality-last-audio').removeClass('quality-bad');
        $('#quality-last-audio').removeClass('quality-good');
    }    

    if(videoPacketsReceived > 0) {
        $('#quality-call-video').text(videoCallQuality + ' %');
        if(videoCallQuality < 80) {
            $('#quality-call-video').removeClass('quality-good');
            $('#quality-call-video').removeClass('quality-none');
            $('#quality-call-video').addClass('quality-bad');
        }
        else {
            $('#quality-call-video').addClass('quality-good');
            $('#quality-call-video').removeClass('quality-none');
            $('#quality-call-video').removeClass('quality-bad');    
        }

        $('#quality-last-video').text(videoCurrentQuality + ' %');
        if(videoCurrentQuality < 80) {
            $('#quality-last-video').removeClass('quality-good');
            $('#quality-last-video').removeClass('quality-none');
            $('#quality-last-video').addClass('quality-bad');
        }
        else {
            $('#quality-last-video').addClass('quality-good');
            $('#quality-last-video').removeClass('quality-none');
            $('#quality-last-video').removeClass('quality-bad');    
        }    
    }
    else {
        $('#quality-call-video').text('-');
        $('#quality-call-video').addClass('quality-none');
        $('#quality-call-video').removeClass('quality-bad');
        $('#quality-call-video').removeClass('quality-good');
        $('#quality-last-video').text('-');
        $('#quality-last-video').addClass('quality-none');
        $('#quality-last-video').removeClass('quality-bad');
        $('#quality-last-video').removeClass('quality-good');
    }

    // if(audioPacketsReceived || audioPacketsSent) {
    //     $('.webrtc-state').text('BUSY');
    // }


    $('#framerate-video').text(framerate + ' fps');
    if(framerate > 15) {
        $('#framerate-video').addClass('quality-good');
        $('#framerate-video').removeClass('quality-bad');
        $('#framerate-video').removeClass('quality-none');
    }
    else if(framerate >0) {
        $('#framerate-video').addClass('quality-bad');
        $('#framerate-video').removeClass('quality-good');
        $('#framerate-video').removeClass('quality-none');
    }
    else {
        $('#framerate-video').addClass('quality-none'); 
        $('#framerate-video').removeClass('quality-bad');
        $('#framerate-video').removeClass('quality-good');  
    }
    
};

function onPeerSDPLocalMediaUsed(data) {
    console.log("DEMO :: Local Media used", data);
    switch (data) {
        case 'no':
            $('.webrtc-local-audio').removeClass('hidden');
            $('.webrtc-local-audio').text('No Media');
            break;
        case 'audio':
            $('.webrtc-local-audio').removeClass('hidden');
            $('.webrtc-local-audio').text('Audio only');
            break;
        case 'video':
            $('.webrtc-local-audio').removeClass('hidden');
            $('.webrtc-local-audio').text('Video only');
            break;
        case 'full':
            $('.webrtc-local-audio').addClass('hidden');
            break;
    }
};

function onPeerSDPRemoteMediaUsed(data) {
    console.log("DEMO :: Remote Media used", data);
    switch (data) {
        case 'no':
            $('.webrtc-remote-audio').removeClass('hidden');
            $('.webrtc-remote-audio').text('No Media');
            break;
        case 'audio':
            $('.webrtc-remote-audio').removeClass('hidden');
            $('.webrtc-remote-audio').text('Audio only');
            break;
        case 'video':
            $('.webrtc-remote-audio').removeClass('hidden');
            $('.webrtc-remote-audio').text('Video only');
            break;
        case 'full':
            $('.webrtc-remote-audio').addClass('hidden');
            break;
    }  
}

function onPeerSDPCodecsNegotiated(data) {
    console.log("DEMO :: Codecs negotiated", data);
    $('.webrtc-state').text(data.audio.toUpperCase() + ' - ' + data.video.toUpperCase());
    codecUsed = data;
}

/* ------------------------- Local Media management ----------------------- */

sono.localMedia().on('onLocalVideoStreamStarted', onLocalStreamStarted, this);
sono.localMedia().on('onLocalVideoStreamEnded', onLocalStreamEnded, this);

function onLocalStreamStarted(data) {
    if(data.stream.getVideoTracks().length > 0) {
        sono.localMedia().renderCameraStream($('.webrtc-container-localVideo')[0]);
        $('.webrtc-container-localVideo').volume = 0;
        $('.webrtc-container-localVideo').prop('muted', true); //mute    
        onPeerSDPLocalMediaUsed('full');

        $('.navbar-audio').hide();
        $('.navbar-space').hide();
        $('.navbar-video-codec').disable(true);
    }
    else {
        onPeerSDPLocalMediaUsed('audio');
        $('.navbar-video').hide();
        $('.navbar-space').hide();
        $('.navbar-audio-codec').disable(true);
    }

    $('.webrtc-state').text('READY');

    isMediaReady = true;

    startCall();
};

function onLocalStreamEnded(stream) {
    isMediaReady = false;
    $('.webrtc-container-localVideo').attr('src', '');
    $('.webrtc-state').text('FREE');    
};

var acquireVideo = function acquireVideo(e) {
    if(e) {
        preventEvent(e);    
    }

    if(inCall) {
        stopCall();
    }
    else {
        sono.localMedia().acquire({media: true, source: ''}, {media: true, source: ''}, 'cam');
        callType = 'full';    
    }
};

var acquireAudio = function acquireAudio(e) {
    if(e) {
        preventEvent(e);    
    }

    if(inCall) {
        stopCall();
    }
    else {
        sono.localMedia().acquire({media: true, source: ''}, {media: false});
        callType = 'audio';
    }
};

function stopVideo() {
  sono.localMedia().releaseCamera();
  $('.webrtc-state').text('FREE');
  $('.webrtc-container-localVideo').attr('src', '');
};

function sendIMMessageToAll() {
    sono.sendIMMessage('Hello all peers !');
};

function startCall() {

    var audioCodec = 'opus',
        videoCodec = 'VP8';

    if(callType === 'audio') {
        audioCodec = $('.navbar-audio-codec').val(),
        videoCodec = '';
    }
    else {
        var listOfCodecs = $('.navbar-video-codec').val().split('-')
        videoCodec = listOfCodecs[0];
        audioCodec = listOfCodecs[1];
    }

    if(lastConnected && isMediaReady) {
        sono.call(lastConnected.ID(), 'video', audioCodec, videoCodec);  
    }
    else {
        if(!lastConnected) {

        }
    }
};

function stopCall(e) {

    if(e) {
        preventEvent(e);    
    }

    if(lastConnected) {
        sono.stopStat(lastConnected.ID());
        sono.endCall(lastConnected.ID());      
    }

    if(callType === 'audio') {
        $('.navbar-video').show();
        $('.navbar-space').show();
        $('.navbar-audio-codec').disable(false);

        $('.btn-pickaudio').addClass('btn-primary');
        $('.btn-pickaudio').removeClass('btn-danger');
        $('.btn-pickaudio').attr('data-original-title', 'Audio call with microphone only');
        $('.btn-pickaudio-icon').addClass('glyphicon-headphones');
        $('.btn-pickaudio-icon').removeClass('glyphicon-phone-alt');
    }
    else {
        $('.navbar-audio').show();
        $('.navbar-space').show();
        $('.navbar-video-codec').disable(false);  

        $('.btn-pickvideo').addClass('btn-warning');
        $('.btn-pickvideo').removeClass('btn-danger');
        $('.btn-pickvideo').attr('data-original-title', 'Video call with microphone and camera');
        $('.btn-pickvideo-icon').addClass('glyphicon-facetime-video');
        $('.btn-pickvideo-icon').removeClass('glyphicon-phone-alt'); 
    }
  
    //sono.transport().exit();
    stopVideo();


}

function preventEvent(e) {
    e.preventDefault();
    e.stopPropagation();
}