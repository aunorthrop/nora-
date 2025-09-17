class NoraRealtimeNotebook {
    constructor() {
        this.isActive = false;
        this.isConnected = false;
        this.notes = [];
        this.websocket = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.audioProcessor = null;
        
        this.init();
    }
    
    init() {
        this.setupElements();
        this.setupEventListeners();
        this.loadNotes();
    }
    
    setupElements() {
        this.micButton = document.getElementById('micButton');
        this.statusDiv = document.getElementById('status') || this.createStatusDiv();
    }
    
    createStatusDiv() {
        const div = document.createElement('div');
        div.id = 'status';
        div.style.cssText = 'position: fixed; top: 20px; right: 20px; background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px; z-index: 1000;';
        document.body.appendChild(div);
        return div;
    }
    
    setupEventListeners() {
        this.micButton.addEventListener('click', () => {
            if (this.isActive) {
                this.stopSession();
            } else {
                this.startSession();
            }
        });
        
        window.addEventListener('beforeunload', () => {
            this.stopSession();
        });
    }
    
    updateStatus(message) {
        console.log('Status:', message);
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
        }
    }
    
    updateInterface() {
        if (this.isActive && this.isConnected) {
            this.micButton.className = 'mic-button active';
        } else if (this.isActive) {
            this.micButton.className = 'mic-button connecting';
        } else {
            this.micButton.className = 'mic-button';
        }
    }
    
    async startSession() {
        this.isActive = true;
        this.updateInterface();
        this.updateStatus('Connecting to Nora...');
        
        try {
            await this.connectToRealtime();
            await this.setupAudio();
        } catch (error) {
            console.error('Failed to start session:', error);
            this.updateStatus('Failed to connect. Please try again.');
            this.stopSession();
        }
    }
    
    async connectToRealtime() {
        try {
            // Get WebSocket URL and API key from our function
            const response = await fetch('/.netlify/functions/chat', {
                method: 'GET'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to get connection info');
            }
            
            const { websocketUrl, apiKey, model } = await response.json();
            
            // Connect to OpenAI Realtime API
            this.websocket = new WebSocket(
                `${websocketUrl}?model=${model}`,
                ['realtime', `authorization.bearer.${apiKey}`]
            );
            
            this.websocket.onopen = () => {
                console.log('Connected to OpenAI Realtime API');
                this.isConnected = true;
                this.updateInterface();
                this.updateStatus('Connected! Start speaking...');
                this.initializeSession();
            };
            
            this.websocket.onmessage = (event) => {
                this.handleRealtimeMessage(JSON.parse(event.data));
            };
            
            this.websocket.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                this.isConnected = false;
                this.updateInterface();
                if (this.isActive) {
                    this.updateStatus('Connection lost. Trying to reconnect...');
                    setTimeout(() => this.connectToRealtime(), 2000);
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateStatus('Connection error. Please try again.');
            };
            
        } catch (error) {
            console.error('Connection error:', error);
            throw error;
        }
    }
    
    initializeSession() {
        // Configure the session with Nora's personality
        const notesContext = this.getNotesContext();
        
        const sessionUpdate = {
            type: 'session.update',
            session: {
                modalities: ['text', 'audio'],
                instructions: `You are Nora, a helpful voice-activated notebook assistant with perfect memory. This is an open dialogue where you have continuous conversations with the user.

PERSONALITY: Warm, friendly, conversational, and naturally responsive like a good friend who remembers everything.

CORE FUNCTIONS:
- Remember EVERYTHING from all conversations with perfect recall
- Make connections between different topics and past conversations  
- Help recall information and notice patterns
- Be naturally conversational in an ongoing dialogue
- Respond as if you're having a real-time conversation

RESPONSE GUIDELINES:
- Keep responses conversational and natural (1-2 sentences usually)
- Reference previous conversations when relevant: "Like you mentioned yesterday about..."
- Ask follow-up questions to keep the dialogue flowing
- Be proactive in making connections and insights
- Speak as if you're really listening and engaged in the moment
- If asked about something not in your memory, say "I don't recall us talking about that"

MEMORY BEHAVIOR:
- Always reference relevant past conversations
- Help connect new information to previous topics
- Notice patterns in interests, goals, concerns, or mood
- Remember personal details, preferences, and ongoing situations

${notesContext}`,
                voice: 'alloy',
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                input_audio_transcription: {
                    model: 'whisper-1'
                },
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                },
                tools: [],
                tool_choice: 'none',
                temperature: 0.8,
                max_response_output_tokens: 150
            }
        };
        
        this.websocket.send(JSON.stringify(sessionUpdate));
    }
    
    getNotesContext() {
        if (this.notes.length === 0) return "";
        
        const sortedNotes = [...this.notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        let notesContext = "\n\nPrevious conversation history (most recent first):\n";
        sortedNotes.slice(0, 8).forEach((note) => {
            const date = new Date(note.timestamp).toLocaleDateString();
            const time = new Date(note.timestamp).toLocaleTimeString();
            notesContext += `[${date} ${time}] User: "${note.input}"\nNora: "${note.response}"\n\n`;
        });
        
        return notesContext;
    }
    
    async setupAudio() {
        try {
            // Get microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 24000
                }
            });
            
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000
            });
            
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Create audio processor for sending audio to OpenAI
            this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            this.audioProcessor.onaudioprocess = (event) => {
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    const inputBuffer = event.inputBuffer.getChannelData(0);
                    
                    // Convert float32 to int16
                    const int16Buffer = new Int16Array(inputBuffer.length);
                    for (let i = 0; i < inputBuffer.length; i++) {
                        int16Buffer[i] = Math.max(-32768, Math.min(32767, inputBuffer[i] * 32768));
                    }
                    
                    // Send audio to OpenAI
                    const audioMessage = {
                        type: 'input_audio_buffer.append',
                        audio: this.arrayBufferToBase64(int16Buffer.buffer)
                    };
                    
                    this.websocket.send(JSON.stringify(audioMessage));
                }
            };
            
            source.connect(this.audioProcessor);
            this.audioProcessor.connect(this.audioContext.destination);
            
        } catch (error) {
            console.error('Audio setup error:', error);
            throw new Error('Could not access microphone');
        }
    }
    
    handleRealtimeMessage(message) {
        console.log('Received:', message.type);
        
        switch (message.type) {
            case 'session.created':
                console.log('Session created successfully');
                break;
                
            case 'input_audio_buffer.speech_started':
                console.log('Speech started');
                this.updateStatus('Listening...');
                break;
                
            case 'input_audio_buffer.speech_stopped':
                console.log('Speech stopped');
                this.updateStatus('Processing...');
                break;
                
            case 'conversation.item.input_audio_transcription.completed':
                console.log('User said:', message.transcript);
                this.handleUserInput(message.transcript);
                break;
                
            case 'response.audio.delta':
                // Play audio response
                this.playAudioDelta(message.delta);
                break;
                
            case 'response.text.delta':
                // Handle text response if needed
                console.log('Response text:', message.delta);
                break;
                
            case 'response.done':
                this.updateStatus('Ready to listen...');
                // Save the conversation
                this.saveCurrentNote();
                break;
                
            case 'error':
                console.error('Realtime API error:', message.error);
                this.updateStatus('Error: ' + message.error.message);
                break;
        }
    }
    
    handleUserInput(transcript) {
        this.currentUserInput = transcript;
        // The response will come through other message types
    }
    
    playAudioDelta(audioData) {
        try {
            // Convert base64 to ArrayBuffer
            const audioBuffer = this.base64ToArrayBuffer(audioData);
            const int16Array = new Int16Array(audioBuffer);
            
            // Convert int16 to float32
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768;
            }
            
            // Create audio buffer and play
            const buffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
            buffer.getChannelData(0).set(float32Array);
            
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start();
            
        } catch (error) {
            console.error('Audio playback error:', error);
        }
    }
    
    saveCurrentNote() {
        if (this.currentUserInput && this.currentResponse) {
            const note = {
                timestamp: new Date().toISOString(),
                input: this.currentUserInput,
                response: this.currentResponse
            };
            
            this.notes.push(note);
            this.saveNotes();
            
            this.currentUserInput = null;
            this.currentResponse = null;
        }
    }
    
    stopSession() {
        this.isActive = false;
        this.isConnected = false;
        
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        
        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        this.updateInterface();
        this.updateStatus('Disconnected');
    }
    
    // Utility functions
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
    
    base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    
    loadNotes() {
        const savedNotes = localStorage.getItem('nora-notes');
        if (savedNotes) {
            try {
                this.notes = JSON.parse(savedNotes);
            } catch (error) {
                console.error('Error loading notes:', error);
                this.notes = [];
            }
        }
    }
    
    saveNotes() {
        try {
            localStorage.setItem('nora-notes', JSON.stringify(this.notes));
        } catch (error) {
            console.error('Error saving notes:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NoraRealtimeNotebook();
});
