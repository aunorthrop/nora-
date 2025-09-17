class NoraNotebook {
    constructor() {
        this.apiKey = null;
        this.isListening = false;
        this.isProcessing = false;
        this.notes = [];
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.noraVoice = null;
        
        this.init();
    }
    
    init() {
        this.setupElements();
        this.setupSpeechRecognition();
        this.setupSpeechSynthesis();
        this.setupEventListeners();
        this.showStatus('Enter your API key to begin');
    }
    
    setupElements() {
        this.micButton = document.getElementById('micButton');
        this.status = document.getElementById('status');
        this.apiSetup = document.getElementById('apiSetup');
        this.apiKeyInput = document.getElementById('apiKey');
        this.saveKeyButton = document.getElementById('saveKey');
        this.clearNotesButton = document.getElementById('clearNotes');
        this.showNotesButton = document.getElementById('showNotes');
        this.notesModal = document.getElementById('notesModal');
        this.closeModalButton = document.getElementById('closeModal');
        this.notesList = document.getElementById('notesList');
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
        
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        
        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateMicButton();
            this.showStatus('Listening... Speak now');
        };
        
        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            if (transcript) {
                this.processUserInput(transcript);
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.showStatus(`Error: ${event.error}. Try again.`);
            this.stopListening();
        };
        
        this.recognition.onend = () => {
            if (this.isListening && !this.isProcessing) {
                this.stopListening();
            }
        };
    }
    
    setupSpeechSynthesis() {
        const setVoice = () => {
            const voices = this.synthesis.getVoices();
            // Look for a good female voice
            this.noraVoice = voices.find(voice => 
                voice.name.includes('Female') || 
                voice.name.includes('Samantha') ||
                voice.name.includes('Victoria') ||
                voice.name.includes('Zira') ||
                (voice.lang.startsWith('en') && voice.name.includes('Google'))
            );
            
            // Fallback to any English voice
            if (!this.noraVoice) {
                this.noraVoice = voices.find(voice => voice.lang.startsWith('en'));
            }
            
            // Last resort - use the first available voice
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
            if (!this.apiKey) {
                this.showStatus('Please enter your OpenAI API key first');
                return;
            }
            
            if (this.isListening) {
                this.stopListening();
            } else {
                this.startListening();
            }
        });
        
        this.saveKeyButton.addEventListener('click', () => {
            const key = this.apiKeyInput.value.trim();
            if (key) {
                if (!key.startsWith('sk-')) {
                    this.showStatus('Please enter a valid OpenAI API key (starts with sk-)');
                    return;
                }
                this.apiKey = key;
                this.apiSetup.classList.add('hidden');
                this.showStatus('Ready! Click "Click to Talk" to start');
            } else {
                this.showStatus('Please enter your API key');
            }
        });
        
        this.apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveKeyButton.click();
            }
        });
        
        this.clearNotesButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all notes? This cannot be undone.')) {
                this.notes = [];
                this.showStatus('All notes cleared');
            }
        });
        
        this.showNotesButton.addEventListener('click', () => {
            this.showNotesModal();
        });
        
        this.closeModalButton.addEventListener('click', () => {
            this.notesModal.classList.add('hidden');
        });
        
        this.notesModal.addEventListener('click', (e) => {
            if (e.target === this.notesModal) {
                this.notesModal.classList.add('hidden');
            }
        });
    }
    
    startListening() {
        if (this.recognition && !this.isListening && !this.isProcessing) {
            try {
                this.recognition.start();
            } catch (error) {
                console.error('Recognition start error:', error);
                this.showStatus('Could not start listening. Please try again.');
            }
        }
    }
    
    stopListening() {
        this.isListening = false;
        if (this.recognition) {
            this.recognition.stop();
        }
        this.updateMicButton();
        if (!this.isProcessing) {
            this.showStatus('Ready! Click to talk again');
        }
    }
    
    updateMicButton() {
        if (this.isProcessing) {
            this.micButton.className = 'mic-button processing';
            this.micText.textContent = 'Processing...';
        } else if (this.isListening) {
            this.micButton.className = 'mic-button listening';
            this.micText.textContent = 'Listening';
        } else {
            this.micButton.className = 'mic-button';
            this.micText.textContent = 'Click to Talk';
        }
    }
    
    showStatus(message) {
        this.status.textContent = message;
    }
    
    async processUserInput(input) {
        this.isProcessing = true;
        this.stopListening();
        this.updateMicButton();
        this.showStatus('Getting response from Nora...');
        
        try {
            const response = await this.getNoraResponse(input);
            
            // Save this interaction to notes
            this.notes.push({
                timestamp: new Date().toISOString(),
                input: input,
                response: response
            });
            
            this.showStatus('Nora is responding...');
            await this.speakResponse(response);
            
        } catch (error) {
            console.error('Error:', error);
            const errorMsg = "I'm having trouble connecting to OpenAI right now. Please check your API key and try again.";
            this.showStatus('Error - check console for details');
            await this.speakResponse(errorMsg);
        }
        
        this.isProcessing = false;
        this.updateMicButton();
        this.showStatus('Ready! Click to talk again');
    }
    
    async getNoraResponse(userInput) {
        let notesContext = "";
        if (this.notes.length > 0) {
            const sortedNotes = [...this.notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            notesContext = "\n\nPrevious conversation history (most recent first):\n";
            sortedNotes.slice(0, 10).forEach((note, index) => {
                const date = new Date(note.timestamp).toLocaleDateString();
                const time = new Date(note.timestamp).toLocaleTimeString();
                notesContext += `[${date} ${time}] User: "${note.input}"\nNora: "${note.response}"\n\n`;
            });
            
            if (this.notes.length > 5) {
                const topics = this.extractKeyTopics();
                notesContext += `\nKey topics discussed: ${topics}\n`;
            }
        }
        
        const messages = [
            {
                role: "system",
                content: `You are Nora, a helpful voice-activated notebook assistant with perfect memory. Your personality is warm, friendly, and professional.

CORE FUNCTIONS:
- Remember EVERYTHING the user tells you with perfect recall
- Make connections between different conversations and topics
- Help users recall information from previous conversations
- Notice patterns and provide insights about their notes and thoughts
- Be conversational and natural in your responses

RESPONSE GUIDELINES:
- Keep responses concise and natural for voice interaction (1-3 sentences usually)
- Reference previous conversations when relevant: "You mentioned that project last week..."
- Be helpful and proactive in making connections
- If asked about something not in your notes, say "I don't have any notes about that yet"
- Speak naturally as if having a real conversation

MEMORY BEHAVIOR:
- Always reference previous conversations when they're relevant to the current topic
- Help users remember details they might have forgotten
- Connect new information to things they've told you before
- Notice patterns in their interests, goals, or concerns

${notesContext}`
            },
            {
                role: "user",
                content: userInput
            }
        ];
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: messages,
                max_tokens: 200,
                temperature: 0.7,
                presence_penalty: 0.3,
                frequency_penalty: 0.3
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API request failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content.trim();
    }
    
    extractKeyTopics() {
        const allText = this.notes.map(note => note.input + " " + note.response).join(" ");
        const words = allText.toLowerCase().match(/\b\w{4,}\b/g) || [];
        const frequency = {};
        const commonWords = ['that', 'this', 'with', 'have', 'they', 'were', 'said', 'from', 'will', 'about', 'your', 'just', 'like', 'know', 'think', 'time', 'good', 'make', 'work', 'also', 'well', 'need', 'want'];
        
        words.forEach(word => {
            if (!commonWords.includes(word)) {
                frequency[word] = (frequency[word] || 0) + 1;
            }
        });
        
        return Object.entries(frequency)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 6)
            .map(([word]) => word)
            .join(", ");
    }
    
    speakResponse(text) {
        return new Promise((resolve) => {
            // Cancel any ongoing speech
            this.synthesis.cancel();
            
            // Wait a moment for the cancel to take effect
            setTimeout(() => {
                const utterance = new SpeechSynthesisUtterance(text);
                
                if (this.noraVoice) {
                    utterance.voice = this.noraVoice;
                }
                
                utterance.rate = 0.95;
                utterance.pitch = 1.0;
                utterance.volume = 0.9;
                
                utterance.onend = () => {
                    resolve();
                };
                
                utterance.onerror = (event) => {
                    console.error('Speech synthesis error:', event);
                    resolve();
                };
                
                this.synthesis.speak(utterance);
            }, 100);
        });
    }
    
    showNotesModal() {
        this.renderNotes();
        this.notesModal.classList.remove('hidden');
    }
    
    renderNotes() {
        if (this.notes.length === 0) {
            this.notesList.innerHTML = '<div class="empty-notes">No notes yet. Start talking to Nora!</div>';
            return;
        }
        
        const sortedNotes = [...this.notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        this.notesList.innerHTML = sortedNotes.map(note => {
            const date = new Date(note.timestamp).toLocaleDateString();
            const time = new Date(note.timestamp).toLocaleTimeString();
            
            return `
                <div class="note-item">
                    <div class="note-date">${date} at ${time}</div>
                    <div class="note-input"><strong>You:</strong> ${note.input}</div>
                    <div class="note-response"><strong>Nora:</strong> ${note.response}</div>
                </div>
            `;
        }).join('');
    }
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new NoraNotebook();
});
