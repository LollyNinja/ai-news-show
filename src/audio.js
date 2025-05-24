// Audio related functionality

import { preloadAllAudioDistributed } from './ai-manager.js';

// Audio for news intro jingle
export const newsJingle = new Audio('news_jingle.mp3');

// Audio for news outro jingle
export const outroJingle = new Audio('news_outro.mp3');

// Audio queue management
let currentAudio = null;
let audioQueue = [];
let preloadedAudio = [];

// Clear the audio queue and stop current playback
export function clearAudioQueue() {
    console.log("Clearing audio queue");
    audioQueue = [];
    if (currentAudio) {
        try {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        } catch (err) {
            console.error("Error clearing current audio:", err);
        }
    }
    
    // Also stop any other playing audio
    const allAudio = document.querySelectorAll('audio');
    allAudio.forEach(audio => {
        try {
            audio.pause();
            audio.currentTime = 0;
        } catch (e) {
            console.error("Error pausing audio:", e);
        }
    });
    
    // CRITICAL FIX: Stop jingles explicitly
    try {
        newsJingle.pause();
        newsJingle.currentTime = 0;
        outroJingle.pause();
        outroJingle.currentTime = 0;
    } catch (e) {
        console.error("Error stopping jingles:", e);
    }
}

// Preload all audio files for the dialogue using distributed processing
export async function preloadAllAudio(dialogue, callbacks, isBackground = false) {
    console.log("Preloading audio for dialogue", dialogue);
    
    try {
        // Use distributed AI processing
        const loadedAudio = await preloadAllAudioDistributed(dialogue, callbacks, isBackground);
        
        // Store the result
        if (!isBackground) {
            preloadedAudio = loadedAudio;
        }
        
        return isBackground ? loadedAudio : preloadedAudio;
    } catch (error) {
        console.error("Error in preloadAllAudio:", error);
        // Make sure we detect cancellation errors and handle them properly
        if (error.message && error.message.includes("canceled by user")) {
            console.log("Preload was canceled by user - propagating cancellation");
        }
        throw error;
    }
}

// Play the preloaded audio sequence with cancellation checks
export async function playPreloadedAudio(isPlayingRef, callbacks, audioSource = null) {
    console.log("Playing preloaded audio", audioSource || preloadedAudio);
    
    // Use provided audio source or default to the main preloaded audio
    const sourceToPlay = audioSource || preloadedAudio;
    
    if (!sourceToPlay || !Array.isArray(sourceToPlay) || sourceToPlay.length === 0) {
        console.error("No audio source to play");
        throw new Error("No audio source available for playback");
    }
    
    // Play each preloaded audio segment in order
    for (let i = 0; i < sourceToPlay.length; i++) {
        // Check if playback should stop after each segment
        if (!isPlayingRef.current) {
            console.log("Playback stopped during audio sequence");
            break;
        }
        
        const segment = sourceToPlay[i];
        if (!segment || !segment.audio) {
            console.warn(`Skipping missing segment at index ${i}`);
            continue;
        }
        
        const speaker = segment.speaker;
        const text = segment.text;
        const audio = segment.audio;
        
        console.log(`Playing segment ${i+1}/${sourceToPlay.length}: ${speaker} - "${text}"`);
        
        // Set active anchor
        callbacks.setActiveAnchor(speaker);
        
        // Update subtitle
        callbacks.updateSubtitle(text);
        
        // Play the preloaded audio
        currentAudio = audio;
        await new Promise((resolve) => {
            const onEnded = () => {
                audio.removeEventListener('ended', onEnded);
                resolve();
            };
            
            // Also resolve if playback is stopped
            const checkStopped = setInterval(() => {
                if (!isPlayingRef.current) {
                    clearInterval(checkStopped);
                    audio.pause();
                    resolve();
                }
            }, 100);
            
            audio.addEventListener('ended', () => {
                clearInterval(checkStopped);
                onEnded();
            });
            
            // Handle errors
            audio.addEventListener('error', (e) => {
                console.error('Audio playback error:', e);
                clearInterval(checkStopped);
                resolve(); // Resolve anyway to continue with next segment
            }, { once: true });
            
            // Start playback
            audio.play().catch(err => {
                console.error("Error playing audio:", err);
                clearInterval(checkStopped);
                resolve(); // Resolve anyway to continue with next segment
            });
        });
        
        // Small pause between speakers
        if (isPlayingRef.current && i < sourceToPlay.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
    
    console.log("Audio playback complete");
    return true;
}

// Get the preloaded audio collection
export function getPreloadedAudio() {
    return preloadedAudio;
}

// Clear preloaded audio to free memory
export function clearPreloadedAudio() {
    console.log("Clearing preloaded audio");
    preloadedAudio = [];
}