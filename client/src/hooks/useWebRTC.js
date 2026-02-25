import { useEffect, useRef, useCallback } from 'react';
import useStateWithCallback from './useStateWithCallback';
import socket from '../socket';
import ACTIONS from '../socket/actions';

export const LOCAL_VIDEO = 'LOCAL_VIDEO';

export default function useWebRTC(roomID) {
  const [clients, updateClients] = useStateWithCallback([]);

  const peerConnections = useRef({});
  const localMediaStream = useRef(null);
  const peerMediaElements = useRef({
    [LOCAL_VIDEO]: null,
  });

  const addNewClient = useCallback((newClient, cb) => {
    updateClients(list => {
      if (!list.includes(newClient)) {
        return [...list, newClient];
      }
      return list;
    }, cb);
  }, [updateClients]);

  // ========================
  // ADD PEER
  // ========================
  useEffect(() => {
    async function handleNewPeer({ peerID, createOffer }) {
      if (peerID in peerConnections.current) return;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ],
      });

      peerConnections.current[peerID] = pc;

      // ICE
      pc.onicecandidate = event => {
        if (event.candidate) {
          socket.emit(ACTIONS.RELAY_ICE, {
            peerID,
            iceCandidate: event.candidate,
          });
        }
      };

      // TRACK
      pc.ontrack = ({ streams: [remoteStream] }) => {
        addNewClient(peerID, () => {
          const element = peerMediaElements.current[peerID];
          if (element) {
            element.srcObject = remoteStream;
          }
        });
      };

      // ADD LOCAL TRACKS
      localMediaStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localMediaStream.current);
      });

      // CREATE OFFER
      if (createOffer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // 🔥 Увеличиваем аудио битрейт
        const sender = pc.getSenders().find(
          s => s.track && s.track.kind === 'audio'
        );

        if (sender) {
          const params = sender.getParameters();
          if (!params.encodings) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = 128000;
          await sender.setParameters(params);
        }

        socket.emit(ACTIONS.RELAY_SDP, {
          peerID,
          sessionDescription: offer,
        });
      }
    }

    socket.on(ACTIONS.ADD_PEER, handleNewPeer);

    return () => {
      socket.off(ACTIONS.ADD_PEER, handleNewPeer);
    };
  }, [addNewClient]);

  // ========================
  // SESSION DESCRIPTION
  // ========================
  useEffect(() => {
    async function handleSessionDescription({ peerID, sessionDescription }) {
      const pc = peerConnections.current[peerID];
      if (!pc) return;

      await pc.setRemoteDescription(
        new RTCSessionDescription(sessionDescription)
      );

      if (sessionDescription.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit(ACTIONS.RELAY_SDP, {
          peerID,
          sessionDescription: answer,
        });
      }
    }

    socket.on(ACTIONS.SESSION_DESCRIPTION, handleSessionDescription);

    return () => {
      socket.off(ACTIONS.SESSION_DESCRIPTION, handleSessionDescription);
    };
  }, []);

  // ========================
  // ICE
  // ========================
  useEffect(() => {
    function handleICE({ peerID, iceCandidate }) {
      const pc = peerConnections.current[peerID];
      if (pc && iceCandidate) {
        pc.addIceCandidate(new RTCIceCandidate(iceCandidate));
      }
    }

    socket.on(ACTIONS.ICE_CANDIDATE, handleICE);

    return () => {
      socket.off(ACTIONS.ICE_CANDIDATE, handleICE);
    };
  }, []);

  // ========================
  // REMOVE PEER
  // ========================
  useEffect(() => {
    function handleRemovePeer({ peerID }) {
      const pc = peerConnections.current[peerID];
      if (pc) {
        pc.close();
      }

      delete peerConnections.current[peerID];
      delete peerMediaElements.current[peerID];

      updateClients(list => list.filter(c => c !== peerID));
    }

    socket.on(ACTIONS.REMOVE_PEER, handleRemovePeer);

    return () => {
      socket.off(ACTIONS.REMOVE_PEER, handleRemovePeer);
    };
  }, [updateClients]);

  // ========================
  // START CAPTURE
  // ========================
  useEffect(() => {
    async function startCapture() {
      localMediaStream.current = await navigator.mediaDevices.getUserMedia({
        audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
        sampleSize: 16
        },
        video: {
          width: 1280,
          height: 720,
        },
      });

      addNewClient(LOCAL_VIDEO, () => {
        const element = peerMediaElements.current[LOCAL_VIDEO];
        if (element) {
          element.volume = 0;
          element.srcObject = localMediaStream.current;
        }
      });
    }

    startCapture()
      .then(() => socket.emit(ACTIONS.JOIN, { room: roomID }))
      .catch(e => console.error('getUserMedia error:', e));

    return () => {
      Object.values(peerConnections.current).forEach(pc => pc.close());

      if (localMediaStream.current) {
        localMediaStream.current.getTracks().forEach(track => track.stop());
      }

      socket.emit(ACTIONS.LEAVE);
    };
  }, [roomID, addNewClient]);

  // ========================
  // REF
  // ========================
  const provideMediaRef = useCallback((id, node) => {
    peerMediaElements.current[id] = node;
  }, []);

  return {
    clients,
    provideMediaRef,
  };
}