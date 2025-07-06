const express = require('express');
const https = require('https');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { AndroidFCM, Client: PushReceiverClient } = require('@liamcottle/push-receiver');
const dotenv = require('dotenv');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');

dotenv.config();

const app = express();
app.use(express.json());

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

app.use((req, res, next) => {

    const allowedOrigins = [
        'https://www.rustalert.com',
        'https://rustalert.com',
        'https://rustalert.vercel.app',
        'http://localhost:5173'
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

const httpsOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/backapi.rustalert.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/backapi.rustalert.com/fullchain.pem')
};

const PORT = process.env.WEB_PORT || 443;

https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`HTTPS server running on port ${PORT}`);
});

// APIs for website

app.post('/get-steamid', async (req, res) => {
    
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ 
                success: false, 
                error: 'No email address' 
            });
        }

        const { data, error } = await supabase
            .from('rust_tokens')
            .select('steam_id')
            .eq('email', email)
            .single();

        if (error) {
            console.error('No steam ID found for this email: ', error);
            return res.status(404).json({ 
            success: false, 
            error: 'No steam ID found for this email'
            });
        }

        return res.json({ 
            success: true, 
            data: { steam_id: data.steam_id } 
        });

    }
    catch (error){
        console.log('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Backend error' 
        });
    }
});

app.post('/check-verified-number', async (req, res) => {

    try {
        const { steamID } = req.body;

        if (!steamID) {
            return res.status(400).json({ 
                success: false, 
                error: 'No SteamID sent' 
            });
        }

        const { data, error } = await supabase
            .from('verified_phone_numbers')
            .select('phone_number')
            .eq('steam_id', steamID);

        if (error) {
            console.error('No verified phone number found: ', error);
            return res.status(404).json({ 
            success: false, 
            error: 'No verified phone number found'
            });
        }
        return res.json({ 
            success: true, 
            data
        });
    }
    catch (error){
        console.log('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Backend error' 
        });
    }

});

app.post('/check-allocations', async (req, res) => {
    const { email } = req.body;

    try {
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                error: 'No email sent for allocation check' 
            });
        }

        const { data, error } = await supabase
            .from('phone_number_allocations')
            .select('numbers_allowed')
            .eq('email', email)
            .single();

        if (error) {
            console.error('No phone number found for allocations: ', error);
            return res.status(404).json({ 
            success: false, 
            error: 'No phone number found for allocations'
            });
        }
        return res.json({ 
            success: true, 
            allocation_number: data.numbers_allowed
        });


    } catch (error) {
        console.log('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Backend error' 
        });
    }
});

app.post('/rust-tokens', async (req, res) => {
    const { email } = req.body;

    try {
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                error: 'No email sent to get tokens' 
            });
        }

        const { data, error } = await supabase
            .from('rust_tokens')
            .select('player_token')
            .eq('email', email)
            .single();

        if (error) {
            console.error('No phone number found for allocations: ', error);
            return res.status(404).json({ 
            success: false, 
            error: 'No phone number found for allocations'
            });
        }

        return res.status(200).json({
            success: true,
            player_token: data.player_token
        })
        
    }catch (error) {
        console.log('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Backend error' 
        });
    }
});

app.post('/server-info', async (req, res) => {
    const { steamID } = req.body;

    try {
        const { data, error } = await supabase
            .from('servers')
            .select('name, smart_alarm_active, triggers, trigger_time, smart_alarm_time')
            .eq('steam_id', steamID)
            .single();

        if (error) {
            console.error('No server info found for user: ', error);
            return res.status(404).json({ 
            success: false, 
            error: 'No server info found for user'
            });
        }

        return res.status(200).json({
            success: true,
            name: data.name,
            alarmStatus: data.smart_alarm_active,
            triggers: data.triggers,
            triggerTime: data.trigger_time,
            alarmTime: data.smart_alarm_time
        })

    } catch (error) {
        console.log('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Backend error' 
        });
    }
});

app.post('/unlink-account', async (req, res) => {
    const { email } = req.body;

    try {
        const { data, error } = await supabase
            .from('rust_tokens')
            .delete()
            .eq('email', email)

        if (error) {
            console.error('No table found for email: ', error);
            return res.status(404).json({ 
            success: false, 
            error: 'No table found for email'
            });
        }

        return res.status(200).json({
            success: true
        })


    } catch (error) {
        console.log('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Backend error' 
        });
    }
});

app.post('/unlink-number', async (req, res) => {
    const { steamID } = req.body;

    try {
        const { data, error } = await supabase
            .from('verified_phone_numbers')
            .delete()
            .eq('steam_id', steamID)

        if (error) {
            console.error('No table found for number: ', error);
            return res.status(404).json({ 
            success: false, 
            error: 'No table found for steamid'
            });
        }

        return res.status(200).json({
            success: true
        })

    } catch (error) {
        console.log('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Backend error' 
        });
    }
});

// APIs for discord bot

const activeMonitors = new Map();

app.post('/pair-with-server', async (req, res) => {

    try {
        const { steamid, token } = req.body;

        const { error } = await supabase
            .from('discord_tokens')
            .upsert( { steamid, token },
               { onConflict: 'steamid' }
            );

        if (error) {
            console.log('Error: ', error)
        }
        
        if (!activeMonitors.has(steamid)) {
            await startMonitoring(steamid, token);
        }

        return res.status(200).json({
            success: true
        })


    } catch (error) {
        console.log('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Backend error' 
        });
    }
});

async function startMonitoring(SteamID, PlayerToken) {

    if (activeMonitors.has(SteamID)) {
            const monitor = activeMonitors.get(SteamID);
            
            if (Date.now() - monitor.lastActive < 300000) {
                console.log(`Monitor for ${SteamID} is already active, skipping registration`);
                return;
            }
            
            console.log(`Cleaning up old monitor for ${SteamID}`);
            try {
                await monitor.fcmClient.destroy();
            } catch (cleanupError) {
                console.error(`Error cleaning up old monitor for ${SteamID}:`, cleanupError);
            }
            activeMonitors.delete(SteamID);
    }

    console.log(`Starting new monitor for ${SteamID}`);

    const credentials = await registerDevice();
    if (!credentials) {
        throw new Error('Failed to register FCM device');
    }

    const expoPushToken = await getExpoPushToken(credentials.fcm.token);

    console.log(`Got Expo token for ${SteamID}:`, expoPushToken);
    
    let retryCount = 0;
    const maxRetries = 3;
    let lastError;
    
    while (retryCount < maxRetries) {
        try {
            await registerWithRustPlus(PlayerToken, expoPushToken);
            console.log(`Successfully registered ${SteamID} with Rust+`);
            break;
        } catch (error) {
            lastError = error;
            retryCount++;
            if (retryCount < maxRetries) {
                console.log(`Retry attempt ${retryCount} for ${SteamID}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    
    if (retryCount === maxRetries) {
        throw lastError || new Error('Failed to register with Rust+ after max retries');
    }
    
    const fcmClient = new PushReceiverClient(
        credentials.gcm.androidId,
        credentials.gcm.securityToken,
        []
    );
    
    let pairingTimeout;
    let pairingFound = false;
    
    pairingTimeout = setTimeout(() => {
        if (!pairingFound) {
            console.log(`Pairing timeout reached for ${SteamID} - stopping monitor`);
            try {
                fcmClient.destroy();
                activeMonitors.delete(SteamID);
            } catch (error) {
                console.error(`Error cleaning up timed out monitor for ${SteamID}:`, error);
            }
        }
    }, 60000);
    
    activeMonitors.set(SteamID, {
        fcmClient,
        expoToken: expoPushToken,
        credentials,
        lastActive: Date.now(),
        pairingTimeout: pairingTimeout
    });

    fcmClient.on('ON_DATA_RECEIVED', async (data) => {
        const timestamp = new Date().toLocaleString();
        console.log(`[${timestamp}] Notification for ${SteamID}:`, data);

        const monitor = activeMonitors.get(SteamID);
        if (monitor) {
            monitor.lastActive = Date.now();
        }

        if (data.appData) {
            const titleData = data.appData.find(item => item.key === 'title')?.value;
            const messageData = data.appData.find(item => item.key === 'message')?.value;
            const bodyData = data.appData.find(item => item.key === 'body')?.value;

            if (messageData === 'Tap to pair with this server.') {
                if (pairingTimeout) {
                    clearTimeout(pairingTimeout);
                    pairingFound = true;
                }
                
                const serverData = JSON.parse(bodyData);

                const { error } = await supabase
                    .from('discord_servers')
                    .upsert({
                        steamid: SteamID,
                        name: serverData.name,
                        status: 'WAITING FOR SMART ALARM',
                        triggers: '0',
                        lastcall: 'NEVER'
                    });
                if (error) {
                    console.log('Error: ', error)
                }
                else {
                    console.log('Logging server: ', serverData.name)
                }
            }
            else if(titleData === 'Smart Alarm' && messageData === 'Tap to pair with this device.') {
                
                const { error } = await supabase
                    .from('discord_servers')
                    .update({
                        status: 'connected'
                    })
                    .eq('steamid', SteamID);

                if (error) {
                    console.log(error)
                }
            }
            else if (messageData === 'Your base is under attack!') {

                const { error } = await supabase
                    .from('discord_servers')
                    .update({
                        status: 'triggered'
                    })
                    .eq('steamid', SteamID);

                if (error) {
                    console.log(error)
                }
            }
        }

    });

    await fcmClient.connect();
    console.log(`Monitor active for ${SteamID} - will timeout in 1 minute if no pairing`);

}

async function registerDevice() {
    console.log('=== Starting FCM Registration ===');
    try {
        const apiKey = "AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY";
        const projectId = "rust-companion-app";
        const gcmSenderId = "976529667804";
        const gmsAppId = "1:976529667804:android:d6f1ddeb4403b338fea619";
        const androidPackageName = "com.facepunch.rust.companion";
        const androidPackageCert = "E28D05345FB78A7A1A63D70F4A302DBF426CA5AD";

        const credentials = await AndroidFCM.register(
            apiKey,
            projectId,
            gcmSenderId,
            gmsAppId,
            androidPackageName,
            androidPackageCert
        );

        console.log('FCM registration successful:', credentials);
        return credentials;
    } catch (error) {
        console.error('FCM registration failed:', error);
        return null;
    }
}

async function getExpoPushToken(fcmToken) {
    const response = await axios.post('https://exp.host/--/api/v2/push/getExpoPushToken', {
        type: 'fcm',
        deviceId: uuidv4(),
        development: false,
        appId: 'com.facepunch.rust.companion',
        deviceToken: fcmToken,
        projectId: "49451aca-a822-41e6-ad59-955718d0ff9c",
    });
    return response.data.data.expoPushToken;
}

async function registerWithRustPlus(authToken, fcmToken) {
    try {
        const cleanToken = authToken.replace(/\s+/g, '');

        const response = await axios.post('https://companion-rust.facepunch.com:443/api/push/register', {
            AuthToken: cleanToken,
            DeviceId: "rustplus.js",
            PushKind: 3,
            PushToken: fcmToken
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'rustplus.js'
            },
            validateStatus: function (status) {
                return status < 500;
            }
        });

        if (response.status === 403) {
            console.error("Authentication failed - invalid or expired token");
            throw new Error("Authentication failed");
        }

        console.log("Registration response:", response.data);
        return response;
    } catch (error) {
        console.error("Registration error:", error.response?.data || error.message);
        throw error;
    }
}

app.post('/disconnect', async (req, res) => {

    try {
        const { steamId } = req.body;

        let success = true;

        if (activeMonitors.has(steamId)) {
            try {
                const monitor = activeMonitors.get(steamId);
                await monitor.fcmClient.destroy();
                activeMonitors.delete(steamId);
                console.log(`Disconnected monitoring for ${steamId}`);

            const { error } = await supabase
                .from('discord_servers')
                .delete()
                .eq('steamid', steamId);

            if (error) {
                console.log('Supabase error: ', error);
            }

            } catch (error) {
                console.error(`Error cleaning up monitor for ${steamId}:`, error);
                success = false;
            }
    } 
    else {
        console.log('No active monitor found');
    }

    res.json({
        success
    });
    } catch (error) {
        console.log(error)
    }

});

// Functions for discord bot

app.post('/check-steamid', async (req, res) => {
    try {
        const { SteamID, Intention } = req.body;

        if (Intention === 'token') {
            const { data, error } = await supabase
                .from('discord_tokens')
                .select('*')
                .eq('steamid', SteamID)
                .maybeSingle();

            const success = data.length > 0;

            res.json({
                success
            });

            if (error) {
                console.log('Error: ', error)
            }
        }

        if (Intention === 'server') {
            const { data, error } = await supabase
                .from('discord_servers')
                .select('*')
                .eq('steamid', SteamID)
                .maybeSingle();

            const success = data.length > 0;

            res.json({
                success
            });

            if (error) {
                console.log('Error: ', error)
            }
        }

    } catch (error) {
        console.log(error)
    }

});

app.post('/server-stats', async (req, res) => {
    try {
        const { SteamID } = req.body;

        const { data, error } = await supabase
            .from('discord_servers')
            .select('*')
            .eq('steamid', SteamID)
            .single();

        if (error) {
            console.error('No row found for steamid: ', error);
            return res.status(404).json({ 
            success: false, 
            error: 'No server row found for steamid'
            });
        }

        return res.status(200).json({
            success: true,
            name: data.name,
            alarmStatus: data.status,
            triggers: data.triggers,
            triggerTime: data.lastcall,
        })

        
        
    } catch (error) {
        console.log(error)
    }


});


