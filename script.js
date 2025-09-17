class NoraNotebook {
    constructor() {
        this.isActive = false;
        this.isListening = false;
        this.isProcessing = false;
        this.isSpeaking = false;
        this.notes = [];
        this.currentConversation = [];
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.noraVoice = null;
        this.shouldRestartListening = false;
        
        this.init();
    }
    
    init() {
        this.setupElements();
        this.setupSpeechRecognition();
        this.setupSpeechSynthesis();
        this.setupEventListeners();
        this.loadNotes();
    }
    
    setupElements() {
        this.micButton = document.getElementById('micButton');
    }
    
    setupSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
        } else if ('SpeechRecognition' in window) {
            this.recognition = new SpeechRecognition();
        } else {
            this.showStatus('Speech recognition not supported in this browser');
            return;
        }
        
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        
        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateInterface();
        };
        
        this.recognition.onresult = (event) => {
            if (!this.isActive) return;
            
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            if (transcript) {
                this.processUserInput(transcript);
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (this.isActive && event.error !== 'aborted') {
                setTimeout(() => this.startListening(), 1000);
            }
        };
        
        this.recognition.onend = () => {
            this.isListening = false;
            this.updateInterface();
            
            if (this.isActive && !this.isProcessing && !this.isSpeaking) {
                setTimeout(() => this.startListening(), 500);
            }
        };
    }
    
    setupSpeechSynthesis() {
        const setVoice = () => {
            const voices = this.synthesis.getVoices();
            
            // First try to find a female voice
            this.noraVoice = voices.find(voice => 
                (voice.name.toLowerCase().includes('female') || 
                 voice.name.toLowerCase().includes('samantha') ||
                 voice.name.toLowerCase().includes('victoria') ||
                 voice.name.toLowerCase().includes('zira') ||
                 voice.name.toLowerCase().includes('karen') ||
                 voice.name.toLowerCase().includes('susan')) && 
                voice.lang.startsWith('en')
            );
            
            // If no female voice, get any English voice
            if (!this.noraVoice) {
                this.noraVoice = voices.find(voice => voice.lang.startsWith('en'));
            }
            
            // Last resort - use default voice
            if (!this.noraVoice && voices.length > 0) {
                this.noraVoice = voices[0];
            }
            
            console.log('Selected voice:', this.noraVoice?.name || 'No voice found');
        };
        
        // Try to set voice immediately
        setVoice();
        
        // Also listen for when voices are loaded
        this.synthesis.addEventListener('voiceschanged', setVoice);
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
    
    startSession() {
        this.isActive = true;
        this.currentConversation = [];
        this.updateInterface();
        
        setTimeout(() => {
            if (this.isActive) {
                this.startListening();
            }
        }, 500);
    }
    
    stopSession() {
        this.isActive = false;
        this.isProcessing = false;
        this.isSpeaking = false;
        this.stopListening();
        this.synthesis.cancel();
        this.updateInterface();
    }
    
    startListening() {
        if (this.recognition && !this.isListening && this.isActive) {
            try {
                this.recognition.start();
            } catch (error) {
                console.error('Recognition start error:', error);
                if (this.isActive) {
                    setTimeout(() => this.startListening(), 1000);
                }
            }
        }
    }
    
    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }
    
    updateInterface() {
        if (this.isProcessing) {
            this.micButton.className = 'mic-button processing';
        } else if (this.isActive) {
            this.micButton.className = 'mic-button active';
        } else {
            this.micButton.className = 'mic-button';
        }
    }
    
    async processUserInput(input) {
        if (!this.isActive) return;
        
        this.isProcessing = true;
        this.updateInterface();
        
        this.currentConversation.push({
            type: 'user',
            text: input,
            timestamp: new Date()
        });
        
        try {
            const response = await this.getNoraResponse(input);
            
            if (!this.isActive) return;
            
            const note = {
                timestamp: new Date().toISOString(),
                input: input,
                response: response
            };
            
            this.notes.push(note);
            this.saveNotes();
            
            this.currentConversation.push({
                type: 'nora',
                text: response,
                timestamp: new Date()
            });
            
            await this.speakResponse(response);
            
        } catch (error) {
            console.error('Error:', error);
            if (this.isActive) {
                const errorMsg = "I'm having trouble connecting right now. Please try again.";
                await this.speakResponse(errorMsg);
            }
        }
        
        this.isProcessing = false;
        if (this.isActive) {
            this.updateInterface();
        }
    }
    
    async getNoraResponse(userInput) {
        let notesContext = "";
        if (this.notes.length > 0) {
            const sortedNotes = [...this.notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            notesContext = "\n\nPrevious conversation history (most recent first):\n";
            sortedNotes.slice(0, 8).forEach((note) => {
                const date = new Date(note.timestamp).toLocaleDateString();
                const time = new Date(note.timestamp).toLocaleTimeString();
                notesContext += `[${date} ${time}] User: "${note.input}"\nNora: "${note.response}"\n\n`;
            });
        }
        
        const messages = [
            {
                role: "system",
                content: `You are Nora, a helpful voice-activated notebook assistant with perfect memory. This is an open dialogue where you have continuous conversations with the user.

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

${notesContext}`
            },
            {
                role: "user",
                content: userInput
            }
        ];
        
        const response = await fetch('/.netlify/functions/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: messages,
                max_tokens: 150,
                temperature: 0.8,
                presence_penalty: 0.3,
                frequency_penalty: 0.3
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Request failed: ${response.status}`);
        }
        
        const data = await response.json();
        return data.response;
    }
    
    speakResponse(text) {
        return new Promise((resolve) => {
            if (!this.isActive) {
                resolve();
                return;
            }
            
            this.isSpeaking = true;
            this.synthesis.cancel();
            
            setTimeout(() => {
                if (!this.isActive) {
                    resolve();
                    return;
                }
                
                const utterance = new SpeechSynthesisUtterance(text);
                
                if (this.noraVoice) {
                    utterance.voice = this.noraVoice;
                }
                
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                utterance.volume = 0.9;
                
                utterance.onend = () => {
                    this.isSpeaking = false;
                    resolve();
                };
                
                utterance.onerror = (event) => {
                    console.error('Speech synthesis error:', event);
                    this.isSpeaking = false;
                    resolve();
                };
                
                this.synthesis.speak(utterance);
                            }, 100);
        });
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
    new NoraNotebook();
});
