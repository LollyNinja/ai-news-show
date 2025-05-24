// Database operations for saving and retrieving broadcasts

// Import sanitization functions
import { 
  sanitizeBroadcast, 
  sanitizeTopic, 
  sanitizeDialogue,
  containsBlockedMediaUrls
} from './feed/sanitize.js';

// Initialize the WebSim database connection with proper cleanup handling
let room;
try {
  room = new WebsimSocket();
  
  // Add error event handler to prevent unhandled promise rejections
  window.addEventListener('beforeunload', () => {
    if (room && room._socket) {
      // Properly close the websocket connection without attempting to enqueue after closed
      room._socket.onmessage = null;
      room._socket.onerror = null;
      room._socket.onclose = null;
    }
  });
} catch (e) {
  console.error("Error initializing WebsimSocket:", e);
  room = {
    collection: () => ({
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => ({}),
      getList: () => [],
      filter: () => ({ getList: () => [] }),
      subscribe: () => (() => {})
    })
  };
}

// Broadcast record types
const BROADCAST_RECORD_TYPE = 'news_broadcast';

// Save a new broadcast to the database
export async function saveBroadcast(topic, dialogue, visibility = 'private') {
    try {
        // Validate and sanitize content before saving
        if (containsBlockedMediaUrls(topic)) {
            throw new Error('Your topic contains URLs to media hosting sites which are not allowed.');
        }
        
        const sanitizedTopic = sanitizeTopic(topic);
        const sanitizedDialogue = sanitizeDialogue(dialogue);
        
        const currentUser = await ensureCurrentUser();
        
        // Create a new broadcast record
        const broadcast = await room.collection(BROADCAST_RECORD_TYPE).create({
            topic: sanitizedTopic,
            dialogue: sanitizedDialogue,
            visibility: visibility,
            timestamp: new Date().toISOString(),
            owner_id: currentUser.id // Store the owner's ID for access control
        });
        
        console.log("Broadcast saved with ID:", broadcast.id);
        return broadcast;
    } catch (error) {
        console.error("Error saving broadcast:", error);
        throw error;
    }
}

// Get all broadcasts based on filter criteria with proper access control
export async function getAllBroadcasts(includePrivate = true, includePublic = true) {
    try {
        const currentUser = await ensureCurrentUser();
        
        // Get all broadcasts
        const allBroadcasts = room.collection(BROADCAST_RECORD_TYPE).getList();
        let broadcasts = [];
        
        // Apply strict access control filtering
        if (includePrivate && includePublic) {
            // Return all broadcasts that are either public or owned by the current user
            broadcasts = allBroadcasts.filter(broadcast => {
                if (broadcast.visibility === 'public') {
                    return true;
                }
                // For private broadcasts, check strict ownership
                return broadcast.username === currentUser.username; 
            });
        } else if (includePrivate) {
            // Return only broadcasts owned by the current user
            broadcasts = allBroadcasts.filter(broadcast => 
                broadcast.username === currentUser.username
            );
        } else if (includePublic) {
            // Return only public broadcasts
            broadcasts = allBroadcasts.filter(broadcast => 
                broadcast.visibility === 'public'
            );
        }
        
        // Sort by timestamp (newest first)
        broadcasts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Sanitize all broadcasts after retrieving
        const sanitizedBroadcasts = broadcasts.map(broadcast => sanitizeBroadcast(broadcast));
        
        return sanitizedBroadcasts;
    } catch (error) {
        console.error("Error getting broadcasts:", error);
        return [];
    }
}

// Update the visibility of a broadcast with permission check
export async function updateBroadcastVisibility(broadcastId, visibility) {
    try {
        const currentUser = await ensureCurrentUser();
        
        // Check that the broadcast exists
        const broadcasts = room.collection(BROADCAST_RECORD_TYPE).getList();
        const broadcast = broadcasts.find(b => b.id === broadcastId);
        
        if (!broadcast) {
            throw new Error('Broadcast not found');
        }
        
        // Check that the user owns the broadcast - strictly compare username
        if (broadcast.username !== currentUser.username) {
            throw new Error('You do not have permission to modify this broadcast');
        }
        
        // Update the broadcast visibility
        await room.collection(BROADCAST_RECORD_TYPE).update(broadcastId, {
            visibility: visibility
        });
        
        return true;
    } catch (error) {
        console.error("Error updating broadcast visibility:", error);
        throw error;
    }
}

// Delete a broadcast with permission check
export async function deleteBroadcast(broadcastId) {
    try {
        const currentUser = await ensureCurrentUser();
        
        // Check that the broadcast exists
        const broadcasts = room.collection(BROADCAST_RECORD_TYPE).getList();
        const broadcast = broadcasts.find(b => b.id === broadcastId);
        
        if (!broadcast) {
            throw new Error('Broadcast not found');
        }
        
        // Check that the user owns the broadcast - strictly compare username
        if (broadcast.username !== currentUser.username) {
            throw new Error('You do not have permission to delete this broadcast');
        }
        
        // Delete the broadcast
        await room.collection(BROADCAST_RECORD_TYPE).delete(broadcastId);
        
        return true;
    } catch (error) {
        console.error("Error deleting broadcast:", error);
        throw error;
    }
}

// Get current user with reliable ID
export async function getCurrentUser() {
    if (!window._currentUser) {
        await ensureCurrentUser();
    }
    return window._currentUser;
}

// Ensure we have the current user with ID
async function ensureCurrentUser() {
    if (!window._currentUser) {
        window._currentUser = { username: null };
        
        try {
            // Use WebsimSocket's built-in user info - this is the most reliable way
            const tempRecord = await room.collection('temp_user_check').create({
                timestamp: new Date().toISOString()
            });
            
            // WebsimSocket automatically adds username to records
            window._currentUser = {
                username: tempRecord.username
            };
            
            console.log("Retrieved user from record:", window._currentUser);
            
            // Clean up the temporary record
            setTimeout(() => {
                room.collection('temp_user_check').delete(tempRecord.id).catch(e => {
                    console.log("Error deleting temporary record:", e);
                });
            }, 1000);
        } catch (e) {
            console.error("Error getting current user:", e);
        }
    }
    
    return window._currentUser;
}

// Subscribe to broadcasts collection with access control
export function subscribeToBroadcasts(callback) {
    return room.collection(BROADCAST_RECORD_TYPE).subscribe(async (allBroadcasts) => {
        const currentUser = await ensureCurrentUser();
        
        // Filter the broadcasts based on access permissions - strict username check
        const accessibleBroadcasts = allBroadcasts.filter(broadcast => {
            if (broadcast.visibility === 'public') {
                return true;
            }
            // For private broadcasts, ONLY the creator can see them
            return broadcast.username === currentUser.username;
        });
        
        // Sanitize broadcasts before sending to callback
        const sanitizedBroadcasts = accessibleBroadcasts.map(broadcast => 
            sanitizeBroadcast(broadcast)
        );
        
        callback(sanitizedBroadcasts);
    });
}