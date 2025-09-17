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
        this.showStatus('Press the button to start talking with Nora');
    }
    
    setupElements() {
        this.micButton = document.getElementById('micButton');
        this.status = document.getElementById('status');
        this.conversationDiv = document.getElementById('conversation');
        this.micText = document.querySelector('.mic-text');
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
            if (this.isActive) {
                this.showStatus('Listening... I can hear you');
            }
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
            if (this.isActive) {
                if (event.error !== 'aborted') {
                    this.showStatus(`Listening error: ${event.error}. Restarting...`);
                    setTimeout(() => this.startListening(), 1000);
                }
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
            this.noraVoice = voices.find(voice => 
                voice.name.includes('Female') || 
                voice.name.includes('Samantha') ||
                voice.name.includes('Victoria') ||
                voice.name.includes('Zira') ||
                (voice.lang.startsWith('en') && voice.name.includes('Google'))
            );
            
            if (!this.noraVoice) {
                this.noraVoice = voices.find(voice => voice.lang.startsWith('en'));
            }
            
            if (!this.noraVoice && voices.length > 0) {
                this.noraVoice = voices[0];
            }
        };
        
        if (this.synthesis.getVoices().length > 0) {
            setVoice();
        } else {
            this.synthesis.onvoiceschanged = setVoice;
        }
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
        this.updateConversation();
        this.showStatus('Starting up... Get ready to talk!');
        
        setTimeout(() => {
            if (this.isActive) {
                this.startListening();
            }
        }, 1000);
    }
    
    stopSession() {
        this.isActive = false;
        this.isProcessing = false;
        this.isSpeaking = false;
        this.stopListening();
        this.synthesis.cancel();
        this.updateInterface();
        this.showStatus('Session ended. Press to start again.');
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
            this.micText.textContent = 'Thinking...';
        } else if (this.isActive) {
            this.micButton.className = 'mic-button active';
            this.micText.textContent = 'Press to Stop';
        } else {
            this.micButton.className = 'mic-button';
            this.micText.textContent = 'Press to Start';
        }
    }
    
    showStatus(message) {
        this.status.textContent = message;
    }
    
    async processUserInput(input) {
        if (!this.isActive) return;
        
        this.isProcessing = true;
        this.updateInterface();
        this.showStatus('Getting response from Nora...');
        
        this.currentConversation.push({
            type: 'user',
            text: input,
            timestamp: new Date()
        });
        this.updateConversation();
        
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
            this.updateConversation();
            
            this.showStatus('Nora is responding...');
            await this.speakResponse(response);
            
        } catch (error) {
            console.error('Error:', error);
            if (this.isActive) {
                const errorMsg = "I'm having trouble connecting right now. Please try again.";
                this.showStatus('Connection error - continuing...');
                await this.speakResponse(errorMsg);
            }
        }
        
        this.isProcessing = false;
        if (this.isActive) {
            this.updateInterface();
            this.showStatus('Listening... I can hear you');
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
            }, 200);
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
    
    updateConversation() {
        if (this.currentConversation.length === 0) {
            this.conversationDiv.innerHTML = '<div class="empty-conversation">Your conversation will appear here...</div>';
            return;
        }
        
        this.conversationDiv.innerHTML = this.currentConversation.map(item => {
            if (item.type === 'user') {
                return `<div class="conversation-item"><div class="user-text">You: ${item.text}</div></div>`;
            } else {
                return `<div class="conversation-item"><div class="nora-text">Nora: ${item.text}</div></div>`;
            }
        }).join('');
        
        this.conversationDiv.scrollTop = this.conversationDiv.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NoraNotebook();
});
