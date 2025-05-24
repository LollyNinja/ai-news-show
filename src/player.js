// Broadcast playback functionality

import { elements } from '../ui.js';
import { 
    updateProgressBar, updateStatus, updateSubtitle, 
    toggleLoading, toggleBreakingNews, toggleProgressContainer,
    setStartButtonText, toggleQueueButton, toggleQueueInfo,
    disableQueueButton
} from '../ui.js';

import { 
    clearAudioQueue, preloadAllAudio, playPreloadedAudio,
    clearPreloadedAudio, newsJingle, outroJingle 
} from '../audio.js';

import { 
    startTalkingAnimation, stopTalkingAnimation,
    playIntroAnimation, showOnAirCountdown, hideOnAirCountdown,
    updateCountdownTimer, playOutroAnimation 
} from '../animations.js';

import { 
    initiateBroadcastHandshake,
    notifyBroadcastLive,
    notifyBroadcastEnd,
    isBroadcastHandshakeComplete
} from './communication.js';

import { generateNewsDialogue } from '../dialogue.js';
import { estimateLoadingTime, updateCountdownBasedOnProgress } from '../utils.js';
import { saveBroadcast } from '../database.js';
import { addNewBroadcast } from '../feed.js';
import { getAISystemStatus } from '../ai-manager.js';
import { getNextReadyBroadcast, removeFirstFromQueue, getQueue, renderQueueList, updateQueueUI } from './queue.js';

// State variables
let isPlaying = false;
let currentAnchor = 1;
let countdownInterval = null;
let estimatedLoadingTime = 0;
let loadingStartTime = 0;
let broadcastStartTime = 0;

// Reference object to share isPlaying state with the audio module
export const isPlayingRef = { current: false };

// Start a broadcast with the given topic
export async function startBroadcast() {
    if (isPlaying) {
        stopBroadcast();
        return;
    }

    const topic = elements.topicInput.value.trim();
    if (!topic) {
        updateStatus('Please enter a topic for the news broadcast.');
        return;
    }

    // Get broadcast visibility
    const visibilityRadios = document.getElementsByName('visibility');
    let visibility = 'private'; 
    for (let i = 0; i < visibilityRadios.length; i++) {
        if (visibilityRadios[i].checked) {
            visibility = visibilityRadios[i].value;
            break;
        }
    }

    // Start the preparation phase
    updateStatus('Initiating broadcast handshake...');
    toggleLoading(true);
    updateSubtitle('Preparing broadcast...');
    
    try {
        // Attempt to establish broadcast handshake with server
        const handshakeData = {
            topic: topic,
            visibility: visibility
        };
        
        const acknowledgment = await initiateBroadcastHandshake(handshakeData);
        if (!acknowledgment || !isBroadcastHandshakeComplete()) {
            throw new Error('Server did not acknowledge broadcast request');
        }
        
        // Handshake successful, proceed with broadcast
        updateStatus('Broadcast handshake successful. Generating news content...');
        
        // Set playing state after successful handshake
        isPlaying = true;
        isPlayingRef.current = true;
        setStartButtonText('Stop Broadcast');
        toggleQueueButton(true);
        
        // Clear any previous queue
        clearAudioQueue();
        
        // Hide settings panel while broadcasting
        elements.settingsPanel.classList.remove('active');
        elements.settingsToggle.textContent = 'Show Settings';
        
        // Calculate estimated loading time based on lines per anchor
        const linesPerAnchor = parseInt(elements.linesPerAnchorSlider.value);
        const totalLines = linesPerAnchor * 2 + 2; 
        
        // Show the on-air overlay with countdown
        estimatedLoadingTime = estimateLoadingTime(totalLines, topic);
        showOnAirCountdown();
        updateCountdownTimer(estimatedLoadingTime);
        
        // Display AI system load in status for debugging
        const aiStatus = getAISystemStatus();
        console.log("Current AI system status:", aiStatus);
        
        // Start countdown timer
        let remainingSeconds = estimatedLoadingTime;
        countdownInterval = setInterval(() => {
            remainingSeconds--;
            if (remainingSeconds <= 0) {
                clearInterval(countdownInterval);
                remainingSeconds = 0;
            }
            updateCountdownTimer(remainingSeconds);
        }, 1000);
        
        // Generate the news dialogue
        elements.preparingLabel.textContent = `Generating news dialogue about "${topic}"...`;
        const dialogue = await generateNewsDialogue(topic, linesPerAnchor);
        
        if (dialogue && dialogue.length > 0) {
            // Save the broadcast to the database
            try {
                const savedBroadcast = await saveBroadcast(topic, dialogue, visibility);
                console.log("Broadcast saved:", savedBroadcast);
                
                // Notify the feed about the new broadcast
                addNewBroadcast(savedBroadcast);
            } catch (error) {
                console.error("Error saving broadcast:", error);
                // Continue with broadcast even if saving fails
            }
            
            // Show progress container
            toggleProgressContainer(true);
            
            // Update preparing label for audio loading phase
            elements.preparingLabel.textContent = `Loading voice audio for ${dialogue.length} lines using parallel processing...`;
            
            // Start recording the actual loading time
            loadingStartTime = Date.now();
            
            // Preload all TTS audio before starting broadcast
            updateStatus('Loading voice audio in parallel... (0/' + dialogue.length + ')');
            
            const preloadCallbacks = {
                updateProgress: updateProgressBar,
                updateStatus: updateStatus,
                updateCountdown: (loaded, total) => {
                    updateCountdownBasedOnProgress(
                        loaded, total, loadingStartTime, countdownInterval, 
                        updateCountdownTimer, elements.preparingLabel
                    );
                }
            };
            
            await preloadAllAudio(dialogue, preloadCallbacks);
            
            // Hide on-air overlay
            hideOnAirCountdown();
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
            
            // Notify server that broadcast is live
            await notifyBroadcastLive({
                topic: topic,
                dialogue: dialogue,
                visibility: visibility
            });
            
            // Record the actual broadcast start time
            broadcastStartTime = Date.now();
            
            // Play the intro animation with news jingle first, then start the broadcast
            await playIntroAnimation();
            
            // Show breaking news banner after intro
            toggleBreakingNews(true, topic);
            
            // Now play the preloaded dialogue
            const playbackCallbacks = {
                setActiveAnchor: (speaker) => {
                    if (speaker === 'James') {
                        currentAnchor = 1;
                        elements.anchor1.classList.add('active');
                        elements.anchor2.classList.remove('active');
                        startTalkingAnimation(elements.anchor1);
                    } else {
                        currentAnchor = 2;
                        elements.anchor2.classList.add('active');
                        elements.anchor1.classList.remove('active');
                        startTalkingAnimation(elements.anchor2);
                    }
                },
                updateSubtitle: updateSubtitle
            };
            
            toggleLoading(false);
            await playPreloadedAudio(isPlayingRef, playbackCallbacks);
            
            // End of broadcast - transition to outro
            if (isPlaying) {
                // Calculate broadcast stats
                const broadcastDuration = Date.now() - broadcastStartTime;
                const broadcastStats = {
                    duration: broadcastDuration,
                    linesPlayed: dialogue.length,
                    successful: true,
                    topic: topic
                };
                
                // Stop talking animation and show outro
                stopTalkingAnimation();
                elements.anchor1.classList.remove('active');
                elements.anchor2.classList.remove('active');
                
                // Play outro animation
                await playOutroAnimation();
                
                // Notify server about broadcast end
                await notifyBroadcastEnd(broadcastStats);
                
                // Check if we have a queued broadcast to play next
                const nextReady = getNextReadyBroadcast();
                if (nextReady) {
                    transitionToNextBroadcast();
                } else {
                    setTimeout(() => {
                        if (isPlaying) {
                            stopBroadcast();
                        }
                    }, 500);
                }
            }
        } else {
            throw new Error('Failed to generate news content.');
        }
    } catch (error) {
        console.error('Error starting broadcast:', error);
        updateStatus('Error: ' + error.message);
        toggleLoading(false);
        toggleProgressContainer(false);
        hideOnAirCountdown();
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        stopBroadcast();
        
        // Notify server about broadcast failure
        const failureStats = {
            successful: false,
            error: error.message,
            phase: 'preparation'
        };
        notifyBroadcastEnd(failureStats).catch(console.error);
    }
}

// Stop the current broadcast
export function stopBroadcast() {
    if (!isPlaying) return;
    
    // Calculate final stats if broadcast was active
    let broadcastStats = {
        duration: broadcastStartTime ? Date.now() - broadcastStartTime : 0,
        successful: true,
        ended_by: 'user'
    };
    
    isPlaying = false;
    isPlayingRef.current = false;
    setStartButtonText('Start Broadcast');
    clearAudioQueue();
    updateSubtitle('Broadcast ended');
    toggleBreakingNews(false);
    toggleLoading(false);
    toggleProgressContainer(false);
    updateStatus('Enter a topic and click \'Start Broadcast\'');
    
    // Reset anchors
    elements.anchor1.classList.remove('active');
    elements.anchor2.classList.remove('active');
    
    // Stop talking animations
    stopTalkingAnimation();
    
    // Clear preloaded audio
    clearPreloadedAudio();
    
    // Reset queue display but keep the queue intact
    const queue = getQueue();
    if (queue.length === 0) {
        toggleQueueInfo(false);
    } else {
        updateQueueUI();
    }
    
    // Hide queue button after stopping
    toggleQueueButton(false);
    
    // Clear any remaining intervals
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    // Ensure overlays are hidden
    hideOnAirCountdown();
    elements.introOverlay.classList.remove('active');
    elements.introOverlay.classList.remove('fade-out');
    elements.outroOverlay.classList.remove('active');
    elements.outroOverlay.classList.remove('fade-out');
    
    // Stop any playing audio
    outroJingle.pause();
    outroJingle.currentTime = 0;
    newsJingle.pause();
    newsJingle.currentTime = 0;
    
    // Notify server about broadcast end
    notifyBroadcastEnd(broadcastStats).catch(console.error);
}

// Transition from current broadcast to the next queued one
export async function transitionToNextBroadcast() {
    const nextBroadcast = getNextReadyBroadcast();
    if (!nextBroadcast) {
        stopBroadcast();
        return;
    }
    
    try {
        // Get broadcast visibility
        const visibilityRadios = document.getElementsByName('visibility');
        let visibility = 'private';
        for (let i = 0; i < visibilityRadios.length; i++) {
            if (visibilityRadios[i].checked) {
                visibility = visibilityRadios[i].value;
                break;
            }
        }
        
        // Send handshake for the queued broadcast
        const handshakeData = {
            topic: nextBroadcast.topic,
            visibility: visibility,
            id: `queued-${nextBroadcast.id}`
        };
        
        updateStatus('Initiating handshake for queued broadcast...');
        
        const acknowledgment = await initiateBroadcastHandshake(handshakeData);
        if (!acknowledgment || !isBroadcastHandshakeComplete()) {
            throw new Error('Server did not acknowledge queued broadcast request');
        }
        
        // Save the broadcast to the database
        try {
            const savedBroadcast = await saveBroadcast(
                nextBroadcast.topic, 
                nextBroadcast.dialogue, 
                visibility
            );
            console.log("Queued broadcast saved:", savedBroadcast);
            
            // Notify the feed about the new broadcast
            addNewBroadcast(savedBroadcast);
        } catch (error) {
            console.error("Error saving queued broadcast:", error);
            // Continue with broadcast even if saving fails
        }
        
        // Notify server that broadcast is live
        await notifyBroadcastLive({
            topic: nextBroadcast.topic,
            dialogue: nextBroadcast.dialogue,
            visibility: visibility
        });
        
        // Record broadcast start time
        broadcastStartTime = Date.now();
        
        // Update UI for the new broadcast
        updateStatus(`Starting queued broadcast: ${nextBroadcast.topic}`);
        toggleBreakingNews(true, nextBroadcast.topic);
        
        // Play the intro animation
        await playIntroAnimation();
        
        // Setup playback callbacks
        const playbackCallbacks = {
            setActiveAnchor: (speaker) => {
                if (speaker === 'James') {
                    currentAnchor = 1;
                    elements.anchor1.classList.add('active');
                    elements.anchor2.classList.remove('active');
                    startTalkingAnimation(elements.anchor1);
                } else {
                    currentAnchor = 2;
                    elements.anchor2.classList.add('active');
                    elements.anchor1.classList.remove('active');
                    startTalkingAnimation(elements.anchor2);
                }
            },
            updateSubtitle: updateSubtitle
        };
        
        // Play the queued broadcast
        await playPreloadedAudio(isPlayingRef, playbackCallbacks, nextBroadcast.audio);
        
        // Calculate broadcast stats
        const broadcastDuration = Date.now() - broadcastStartTime;
        const broadcastStats = {
            duration: broadcastDuration,
            linesPlayed: nextBroadcast.dialogue.length,
            successful: true,
            topic: nextBroadcast.topic,
            queued: true
        };
        
        // Remove the played broadcast from the queue
        removeFirstFromQueue();
        
        // End of broadcast - transition to outro
        if (isPlaying) {
            // Stop talking animation and show outro
            stopTalkingAnimation();
            elements.anchor1.classList.remove('active');
            elements.anchor2.classList.remove('active');
            
            // Play outro animation
            await playOutroAnimation();
            
            // Notify server about broadcast end
            await notifyBroadcastEnd(broadcastStats);
            
            // Check if we have more broadcasts in the queue
            const nextReady = getNextReadyBroadcast();
            if (nextReady) {
                transitionToNextBroadcast();
            } else {
                setTimeout(() => {
                    if (isPlaying) {
                        stopBroadcast();
                    }
                }, 500);
            }
        }
    } catch (error) {
        console.error('Error transitioning to queued broadcast:', error);
        
        // Notify server about broadcast failure
        const failureStats = {
            successful: false,
            error: error.message,
            phase: 'queued_transition',
            topic: nextBroadcast?.topic || 'unknown'
        };
        notifyBroadcastEnd(failureStats).catch(console.error);
        
        // Remove the problematic broadcast from the queue
        removeFirstFromQueue();
        
        // Try to continue with the next one if available
        const nextReady = getNextReadyBroadcast();
        if (nextReady) {
            transitionToNextBroadcast();
        } else {
            stopBroadcast();
        }
    }
}

// Get the current playback state
export function getPlaybackState() {
    return {
        isPlaying,
        isPlayingRef,
        currentAnchor
    };
}