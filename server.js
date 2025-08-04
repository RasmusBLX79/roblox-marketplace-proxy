// proxy-server.js
// Deploy this to Vercel, Heroku, or any cloud service

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for Roblox requests
app.use(cors({
    origin: '*', // In production, restrict this to your game's domain
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Roblox API endpoints
const ROBLOX_APIS = {
    USER_GAMES: 'https://games.roblox.com/v2/users/{userId}/games?sortOrder=Asc&limit=50',
    GAME_GAMEPASSES: 'https://games.roblox.com/v1/games/{gameId}/game-passes?sortOrder=Asc&limit=50',
    USER_INVENTORY: 'https://inventory.roblox.com/v2/users/{userId}/inventory?assetTypes={assetTypes}&limit=50&sortOrder=Desc',
    USER_CREATED_ITEMS: 'https://catalog.roblox.com/v1/search/items?category=All&creatorTargetId={userId}&limit=50&sortOrder=Updated'
};

// Helper function to make safe HTTP requests with retries
async function safeRequest(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`🔍 Fetching: ${url} (attempt ${i + 1})`);
            
            const response = await axios.get(url, {
                timeout: 10000, // 10 second timeout
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            return response.data;
        } catch (error) {
            console.warn(`❌ Request failed (attempt ${i + 1}):`, error.message);
            
            if (i === maxRetries - 1) {
                throw error;
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
}

// Get user's created games
async function getUserGames(userId) {
    try {
        const url = ROBLOX_APIS.USER_GAMES.replace('{userId}', userId);
        const data = await safeRequest(url);
        return data.data || [];
    } catch (error) {
        console.error('Error fetching user games:', error.message);
        return [];
    }
}

// Get gamepasses from a specific game
async function getGameGamepasses(gameId) {
    try {
        const url = ROBLOX_APIS.GAME_GAMEPASSES.replace('{gameId}', gameId);
        const data = await safeRequest(url);
        
        const gamepasses = [];
        if (data.data) {
            for (const gamepass of data.data) {
                // Only include gamepasses that are for sale
                if (gamepass.isForSale && gamepass.price > 0) {
                    gamepasses.push({
                        id: gamepass.id,
                        name: gamepass.name,
                        price: gamepass.price,
                        description: gamepass.description || "",
                        type: "GamePass",
                        gameId: gameId
                    });
                }
            }
        }
        
        return gamepasses;
    } catch (error) {
        console.error('Error fetching game gamepasses:', error.message);
        return [];
    }
}

// Get user's created items (shirts, pants, etc.)
async function getUserCreatedItems(userId) {
    try {
        const url = ROBLOX_APIS.USER_CREATED_ITEMS.replace('{userId}', userId);
        const data = await safeRequest(url);
        
        const items = [];
        if (data.data) {
            for (const item of data.data) {
                // Only include items that are for sale and are sellable types
                if (item.isForSale && item.price && item.price > 0) {
                    const itemType = item.assetType ? item.assetType.name : "Unknown";
                    
                    // Check if this item type can be sold
                    if (['Shirt', 'Pants', 'TShirt'].includes(itemType)) {
                        items.push({
                            id: item.id,
                            name: item.name,
                            price: item.price,
                            description: item.description || "",
                            type: itemType
                        });
                    }
                }
            }
        }
        
        return items;
    } catch (error) {
        console.error('Error fetching user created items:', error.message);
        return [];
    }
}

// Main endpoint: Get all player's sellable items
app.get('/api/user/:userId/sellable-items', async (req, res) => {
    const userId = req.params.userId;
    
    console.log(`📋 Getting sellable items for user ${userId}`);
    
    try {
        const allItems = [];
        
        // 1. Get user's created games and their gamepasses
        console.log(`🎮 Fetching games for user ${userId}`);
        const userGames = await getUserGames(userId);
        console.log(`Found ${userGames.length} games`);
        
        for (const game of userGames) {
            if (game.id) {
                console.log(`🎫 Fetching gamepasses for game: ${game.name} (${game.id})`);
                const gamepasses = await getGameGamepasses(game.id);
                console.log(`Found ${gamepasses.length} gamepasses`);
                
                allItems.push(...gamepasses);
            }
        }
        
        // 2. Get user's created clothing items
        console.log(`👕 Fetching created items for user ${userId}`);
        const userItems = await getUserCreatedItems(userId);
        console.log(`Found ${userItems.length} sellable items`);
        
        allItems.push(...userItems);
        
        console.log(`✅ Total sellable items for user ${userId}: ${allItems.length}`);
        
        res.json({
            success: true,
            userId: userId,
            items: allItems,
            count: allItems.length
        });
        
    } catch (error) {
        console.error('Error getting sellable items:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            items: [],
            count: 0
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'PLS Donate Style Roblox API Proxy',
        endpoints: {
            'GET /api/user/:userId/sellable-items': 'Get user\'s sellable gamepasses and clothing items',
            'GET /health': 'Health check'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Roblox API Proxy Server running on port ${PORT}`);
    console.log(`📡 Ready to proxy Roblox API requests!`);
});

module.exports = app;