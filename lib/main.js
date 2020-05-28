import delay from 'delay';
import wrtc from 'wrtc';
import readline from 'readline-promise';

const rlp = readline.default.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

const TIME_TO_CONNECTED = 10000;
const TIME_TO_HOST_CANDIDATES = 30000;  // NOTE(mroberts): Too long.
const TIME_TO_RECONNECTED = 10000;

const options = {
  // RTCPeerConnection: DefaultRTCPeerConnection,
  beforeOffer() {},
  clearTimeout,
  setTimeout,
  timeToConnected: TIME_TO_CONNECTED,
  timeToHostCandidates: TIME_TO_HOST_CANDIDATES,
  timeToReconnected: TIME_TO_RECONNECTED,
  // ...options
};

let connectionTimer = null;
let reconnectionTimer = null;

const onIceConnectionStateChange = event => {
  console.log('AAAAAAAAAAAaa', peerConnection.iceConnectionState);
  console.log('BBBBBBBBBBBBB', event);
  if (peerConnection.iceConnectionState === 'connected'
    || peerConnection.iceConnectionState === 'completed') {
    if (connectionTimer) {
      options.clearTimeout(connectionTimer);
      connectionTimer = null;
    }
    options.clearTimeout(reconnectionTimer);
    reconnectionTimer = null;
  } else if (peerConnection.iceConnectionState === 'disconnected'
    || peerConnection.iceConnectionState === 'failed') {
    if (!connectionTimer && !reconnectionTimer) {
      const self = this;
      reconnectionTimer = options.setTimeout(() => {
        self.close();
      }, timeToReconnected);
    }
  }
};

const configuration = {
  // iceServers: [{urls: 'stun:stun1.l.google.com:19302'}],
  // iceServers: [{urls: 'stun:stun1.voiceeclipse.net:3478'}],
  // iceServers: [{urls: 'stun:stun4.l.google.com:19302'}],
  sdpSemantics: 'unified-plan'
};
const peerConnection = new wrtc.RTCPeerConnection(configuration);


// setup data channel
const dataChannel = peerConnection.createDataChannel('ping-pong');
function onMessage({ data }) {
  if (data === 'ping') {
    dataChannel.send('pong');
  }
}
dataChannel.addEventListener('message', onMessage);

peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange);

(async () => {
  await makeCall();

  const answerText = await rlp.questionAsync('Answer from peer: ');
  const answer = JSON.parse(answerText);
  console.log('ANSWER', answer);

  peerConnection.addEventListener('connectionstatechange', async event => {
    console.log('connection state event', event);
    console.log('connection state', peerConnection.connectionState);
    if (peerConnection.connectionState === 'connected') {
      // Peers connected!
      console.log('sending pings');
      for(let i = 0; i < 10000; ++i) {
        console.log(`ping ${i}`);
        dataChannel.send('ping');
        await delay(1000);
      }
    }
  });


  const remoteDesc = new wrtc.RTCSessionDescription(answer);
  await peerConnection.setRemoteDescription(remoteDesc);

  // Listen for local ICE candidates on the local RTCPeerConnection
  // peerConnection.addEventListener('icecandidate', event => {
  //   console.log('ICECANDIDATE', event);
  //   if (event.candidate) {
  //       // signalingChannel.send({'new-ice-candidate': event.candidate});
  //   }
  // });

  console.log('waiting for connection...');
})();


async function makeCall() {
  // signalingChannel.addEventListener('message', async message => {
  //     if (message.answer) {
  //         const remoteDesc = new RTCSessionDescription(message.answer);
  //         await peerConnection.setRemoteDescription(remoteDesc);
  //     }
  // });
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  // console.log('OFFER', JSON.stringify(offer));
  // signalingChannel.send({'offer': offer});

  try {
    // this is global `options`
    await waitUntilIceGatheringStateComplete(peerConnection, options);
  } catch (error) {
    // this.close();
    console.error('error');
    throw error;
  }
  console.log('gathering complete');
  console.log('OFFER', JSON.stringify(peerConnection.localDescription));
}

async function waitUntilIceGatheringStateComplete(peerConnection, options) {
  if (peerConnection.iceGatheringState === 'complete') {
    return;
  }

  const { timeToHostCandidates } = options;

  const deferred = {};
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  const timeout = options.setTimeout(() => {
    peerConnection.removeEventListener('icecandidate', onIceCandidate);
    deferred.reject(new Error('Timed out waiting for host candidates'));
  }, timeToHostCandidates);

  function onIceCandidate({ candidate }) {
    if (!candidate) {
      options.clearTimeout(timeout);
      peerConnection.removeEventListener('icecandidate', onIceCandidate);
      deferred.resolve();
    }
  }

  peerConnection.addEventListener('icecandidate', onIceCandidate);

  await deferred.promise;
}
