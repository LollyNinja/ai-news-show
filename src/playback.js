// Feed broadcast playback

import { 
    preloadAllAudio, 
    playPreloadedAudio, 
    newsJingle, 
    outroJingle,
    clearAudioQueue
} from '../audio.js';

import {
    startTalkingAnimation,
    stopTalkingAnimation
} from '../animations.js';

import { updatePlayingState, showFeedStudio } from './ui.js';
import { closeFeedStudio, wasBroadcastCanceledByUser } from './actions.js';
import { sanitizeHtml, sanitizeDomElements } from './sanitize.js';

// Play animation with a specific overlay
export async function playAnimationWithOverlay(overlay) {
    return new Promise((resolve) => {
        if (!overlay) {
            console.error("Overlay element not found");
            resolve();
            return;
        }
        
        // Reset and make overlay visible
        overlay.classList.remove('fade-out');
        overlay.classList.add('active');
        
        // Start the appropriate jingle
        if (overlay.id === 'feed-intro-overlay') {
            newsJingle.currentTime = 0;
            newsJingle.play().catch(err => {
                console.error("Error playing news jingle:", err);
            });
        } else {
            outroJingle.currentTime = 0;
            outroJingle.play().catch(err => {
                console.error("Error playing outro jingle:", err);
            });
        }
        
        // Set a timeout for the fade-out effect and resolution
        setTimeout(() => {
            overlay.classList.add('fade-out');
            
            // Wait for fade-out to complete before resolving
            setTimeout(() => {
                overlay.classList.remove('active');
                resolve();
            }, 1000); // Fade out duration
            
        }, 4500); // Animation duration before fade-out
    });
}

// Start playback of a broadcast with optimized parallel loading
export async function startPlayback(dialogue, topic, isPlayingRef, feedElements, currentlyPlayingId) {
    try {
        // Make sure any previous audio is stopped
        clearAudioQueue();
        
        // Show the news studio interface
        showFeedStudio();
        
        // Perform initial DOM sanitization
        sanitizeDomElements(feedElements.feedStudioContainer);
        
        // Reset studio elements
        if (feedElements.anchor1) feedElements.anchor1.classList.remove('active', 'talking');
        if (feedElements.anchor2) feedElements.anchor2.classList.remove('active', 'talking');
        if (feedElements.subtitle) feedElements.subtitle.textContent = 'Welcome to AI News Network';
        
        // Validate dialogue data
        if (!dialogue || !Array.isArray(dialogue)) {
            throw new Error('Invalid dialogue data');
        }
        
        // Extra sanitization layer for dialogue text
        const sanitizedDialogue = dialogue.map(item => {
            if (item && item.text) {
                return {
                    ...item,
                    text: sanitizeHtml(item.text)
                };
            }
            return item;
        });
        
        // Sanitize topic
        const sanitizedTopic = sanitizeHtml(topic);
        
        console.log("Preloading audio for sanitized dialogue");
        
        // Update loading indicator in the feed studio - ensure it's visible
        if (feedElements.loadingIndicator) {
            feedElements.loadingIndicator.style.display = 'flex';
            // Initialize progress bar to 0%
            if (feedElements.loadingProgress) {
                feedElements.loadingProgress.style.width = '0%';
            }
            // Set initial loading message
            if (feedElements.loadingText) {
                feedElements.loadingText.textContent = `Initializing audio processing for ${sanitizedDialogue.length} lines...`;
            }
        }
        
        // Track individual audio segments for more precise progress updates
        const totalSegments = sanitizedDialogue.length;
        let loadedSegments = 0;
        let lastProgressPercentage = 0;
        
        // Preload the audio for each dialogue line with parallel processing
        const callbacks = {
            updateProgress: (progress) => {
                console.log(`Audio preload progress: ${progress}%`);
                // Check for cancellation at each progress update
                if (wasBroadcastCanceledByUser()) {
                    console.log("Detected broadcast cancellation during audio preloading");
                    throw new Error("Broadcast loading was canceled by user");
                }
                
                // Only update if progress has meaningfully changed (avoid too many DOM updates)
                if (progress > lastProgressPercentage + 1 || progress === 100) {
                    lastProgressPercentage = progress;
                    
                    // Update the visual progress bar
                    if (feedElements.loadingProgress) {
                        // Smooth animation for progress bar
                        feedElements.loadingProgress.style.transition = 'width 0.3s ease';
                        feedElements.loadingProgress.style.width = `${progress}%`;
                    }
                    
                    // Also update feed status
                    if (feedElements.feedStatus) {
                        const progressText = progress < 100 
                            ? `Loading broadcast: ${progress}% complete...` 
                            : `Broadcast loaded, preparing playback...`;
                        feedElements.feedStatus.textContent = progressText;
                    }
                }
            },
            updateStatus: (status) => {
                console.log(`Audio preload status: ${status}`);
                if (feedElements.feedStatus) {
                    feedElements.feedStatus.textContent = status;
                }
            },
            updateCountdown: (loaded, total) => {
                // Check for cancellation at each countdown update
                if (wasBroadcastCanceledByUser()) {
                    console.log("Detected broadcast cancellation during audio loading");
                    throw new Error("Broadcast loading was canceled by user");
                }
                
                // Calculate more precise progress percentage
                loadedSegments = loaded;
                const percentage = Math.round((loaded / total) * 100);
                
                console.log(`Audio preload progress: ${loaded}/${total} (${percentage}%)`);
                
                // Update loading indicators
                if (feedElements.feedStatus) {
                    feedElements.feedStatus.textContent = `Loading audio: ${loaded}/${total} lines (${percentage}%)`;
                }
                
                if (feedElements.loadingText) {
                    feedElements.loadingText.textContent = `Loading audio: ${loaded}/${total} lines (${percentage}%)`;
                }
                
                // Update progress bar with smooth animation
                if (feedElements.loadingProgress) {
                    feedElements.loadingProgress.style.transition = 'width 0.3s ease';
                    feedElements.loadingProgress.style.width = `${percentage}%`;
                }
                
                // Also update the play button for this broadcast
                updatePlayingState(currentlyPlayingId, true, true, `Loading: ${loaded}/${total} (${percentage}%)`);
            }
        };
        
        // Add cancellation check before starting preload
        if (wasBroadcastCanceledByUser()) {
            console.log("Broadcast canceled before audio preloading started");
            throw new Error("Broadcast loading was canceled by user");
        }
        
        const preloadedAudio = await preloadAllAudio(sanitizedDialogue, callbacks, true);
        
        // If canceled during loading, exit
        if (wasBroadcastCanceledByUser()) {
            console.log("Broadcast was canceled during loading - stopping playback preparation");
            throw new Error("Broadcast loading was canceled by user");
        }
        
        // If stopped during loading, exit
        if (!isPlayingRef.current) {
            console.log("Playback stopped during loading");
            // Hide loading indicator
            if (feedElements.loadingIndicator) {
                feedElements.loadingIndicator.style.display = 'none';
            }
            return;
        }
        
        // Ensure progress bar shows 100% before hiding loading indicator
        if (feedElements.loadingProgress) {
            feedElements.loadingProgress.style.width = '100%';
            
            // Show "Complete" status briefly before continuing
            if (feedElements.loadingText) {
                feedElements.loadingText.textContent = `Loading complete! Starting broadcast...`;
            }
            
            // Small delay to show the 100% state before hiding
            await new Promise(resolve => setTimeout(resolve, 800));
        }
        
        // One final cancellation check before proceeding
        if (wasBroadcastCanceledByUser() || !isPlayingRef.current) {
            console.log("Broadcast canceled after preloading but before playback");
            throw new Error("Broadcast loading was canceled by user");
        }
        
        // Hide loading indicator
        if (feedElements.loadingIndicator) {
            feedElements.loadingIndicator.style.display = 'none';
        }
        
        // Set breaking news content - with sanitized topic
        if (feedElements.breakingNews) {
            feedElements.breakingNews.textContent = `BREAKING NEWS: ${sanitizedTopic.toUpperCase()}`;
            feedElements.breakingNews.style.display = 'block';
        }
        
        // Update the play button to "Now Playing"
        updatePlayingState(currentlyPlayingId, true, false);
        
        // Play intro animation
        console.log("Playing intro animation");
        await playAnimationWithOverlay(feedElements.introOverlay);
        
        // Check for cancellation after intro animation
        if (wasBroadcastCanceledByUser()) {
            console.log("Broadcast was canceled during intro animation");
            throw new Error("Broadcast loading was canceled by user");
        }
        
        // If stopped during intro, exit
        if (!isPlayingRef.current) {
            console.log("Playback stopped during intro");
            return;
        }
        
        // Create playback callbacks for visual sync with additional sanitization
        console.log("Setting up playback callbacks");
        const playbackCallbacks = {
            setActiveAnchor: (speaker) => {
                console.log(`Active anchor: ${speaker}`);
                if (speaker === 'James') {
                    if (feedElements.anchor1) {
                        feedElements.anchor1.classList.add('active');
                        startTalkingAnimation(feedElements.anchor1);
                    }
                    if (feedElements.anchor2) {
                        feedElements.anchor2.classList.remove('active');
                        stopTalkingAnimation(feedElements.anchor2);
                    }
                } else {
                    if (feedElements.anchor2) {
                        feedElements.anchor2.classList.add('active');
                        startTalkingAnimation(feedElements.anchor2);
                    }
                    if (feedElements.anchor1) {
                        feedElements.anchor1.classList.remove('active');
                        stopTalkingAnimation(feedElements.anchor1);
                    }
                }
                
                // Perform runtime DOM sanitization after anchor changes
                sanitizeDomElements(feedElements.feedStudioContainer);
            },
            updateSubtitle: (text) => {
                console.log(`Subtitle: ${text}`);
                if (feedElements.subtitle) {
                    // Apply sanitization to subtitle text
                    const sanitizedText = sanitizeHtml(text);
                    feedElements.subtitle.textContent = sanitizedText;
                    
                    // Perform runtime DOM sanitization after subtitle changes
                    sanitizeDomElements(feedElements.feedStudioContainer);
                }
            }
        };
        
        // Play the audio with visual animations - use sanitized dialogue
        console.log("Starting audio playback");
        await playPreloadedAudio(isPlayingRef, playbackCallbacks, preloadedAudio);
        
        // Run final sanitization check
        sanitizeDomElements(feedElements.feedStudioContainer);
        
        // If still playing after audio finishes, show outro
        if (isPlayingRef.current) {
            console.log("Playback complete, showing outro");
            // Stop anchor animations
            stopTalkingAnimation(feedElements.anchor1);
            stopTalkingAnimation(feedElements.anchor2);
            if (feedElements.anchor1) feedElements.anchor1.classList.remove('active');
            if (feedElements.anchor2) feedElements.anchor2.classList.remove('active');
            
            // Play outro animation
            await playAnimationWithOverlay(feedElements.outroOverlay);
            
            // Auto-close the studio after outro
            if (isPlayingRef.current) {
                closeFeedStudio();
            }
        }
    } catch (error) {
        console.error('Error in startPlayback:', error);
        
        // Special handling for cancellation errors
        if (error.message.includes("canceled by user")) {
            console.log("Broadcast was canceled by user - cleaning up");
            
            // CRITICAL FIX: Perform explicit cleanup for cancellation
            if (feedElements.loadingIndicator) {
                feedElements.loadingIndicator.style.display = 'none';
            }
            
            // Ensure audio is properly stopped and cleared
            clearAudioQueue();
            
            // No need to rethrow, just clean up
        } else {
            // Hide loading indicator in case of error
            if (feedElements.loadingIndicator) {
                feedElements.loadingIndicator.style.display = 'none';
            }
            
            throw error;
        }
    }
}

// Stop playback of a broadcast
export function stopPlayback(currentlyPlayingId, isPlayingRef) {
    console.log("Stopping playback");
    isPlayingRef.current = false;
    
    // Reset and stop the audio
    outroJingle.pause();
    outroJingle.currentTime = 0;
    newsJingle.pause();
    newsJingle.currentTime = 0;
    
    // Clear any audio in the queue
    clearAudioQueue();
    
    // CRITICAL FIX: Ensure all audio elements are properly stopped
    const allAudio = document.querySelectorAll('audio');
    allAudio.forEach(audio => {
        try {
            audio.pause();
            audio.currentTime = 0;
        } catch (e) {
            console.error("Error stopping audio:", e);
        }
    });
    
    // Update the play buttons in the feed
    if (currentlyPlayingId) {
        updatePlayingState(currentlyPlayingId, false);
    }
}