class NoraNotebook {
    constructor() {
        this.apiKey = null;
        this.isListening = false;
        this.isProcessing = false;
        this.notes = []; // All the user's notes/memories
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.noraVoice = null;
        
        this.init();
    }
    
    init() {
        this.setupElements();
        this.setupSpeechRecognition();
        this.setupSpeechSynthesis();
        this.loadApiKey();
        this.setupEventListeners();
    }
    
    setupElements() {
        this.micButton = document.getElementById('micButton');
        this.status = document.getElementById('status');
        this.apiSetup = document.getElementById('apiSetup');
        this.apiKeyInput = document.getElementById('apiKey');
        this.saveKeyButton = document.getElementById('saveKey');
    }
    
    setupSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
        } else if ('SpeechRecognition' in window) {
            this.recognition = new SpeechRecognition();
        } else {
            this.showStatus('Speech recognition not supported');
            return;
        }
        
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        
        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateMicButton();
            this.showStatus('Listening...');
        };
        
        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            
            if (finalTranscript.trim()) {
                this.processUserInput(finalTranscript.trim());
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.showStatus('Error. Try again.');
            this.stopListening();
        };
        
        this.recognition.onend = () => {
            if (this.isListening) {
                setTimeout(() => {
                    if (this.isListening) {
                        this.recognition.start();
                    }
                }, 100);
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
                voice.lang.startsWith('en')
            ) || voices[0];
        };
        
        if (this.synthesis.getVoices().length > 0) {
            setVoice();
        } else {
            this.synthesis.onvoiceschanged = setVoice;
        }
    }
    
    loadApiKey() {
        const savedKey = localStorage.getItem('openai_api_key');
        if (savedKey) {
            this.apiKey = savedKey;
            this.apiSetup.classList.add('hidden');
        } else {
            // Show API setup if no key is saved
            this.apiSetup.classList.remove('hidden');
        }
        
        // Load saved notes
        const savedNotes = localStorage.getItem('nora_notes');
        if (savedNotes) {
            this.notes = JSON.parse(savedNotes);
        }
    }
    
    saveNotes() {
        localStorage.setItem('nora_notes', JSON.stringify(this.notes));
    }
    
    setupEventListeners() {
        this.micButton.addEventListener('click', () => {
            if (!this.apiKey) {
                this.showStatus('Enter your OpenAI API key first');
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
                this.apiKey = key;
                localStorage.setItem('openai_api_key', key);
                this.apiSetup.classList.add('hidden');
                this.showStatus('Press to start');
            }
        });
        
        this.apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveKeyButton.click();
            }
        });
    }
    
    startListening() {
        if (this.recognition) {
            this.isListening = true;
            this.recognition.start();
        }
    }
    
    stopListening() {
        this.isListening = false;
        if (this.recognition) {
            this.recognition.stop();
        }
        this.updateMicButton();
        this.showStatus('Press to start');
    }
    
    updateMicButton() {
        if (this.isProcessing) {
            this.micButton.className = 'mic-button processing';
            this.showStatus('Processing...');
        } else if (this.isListening) {
            this.micButton.className = 'mic-button listening';
        } else {
            this.micButton.className = 'mic-button';
        }
    }
    
    showStatus(message) {
        this.status.textContent = message;
    }
    
    async processUserInput(input) {
        this.isProcessing = true;
        this.updateMicButton();
        
        try {
            const response = await this.getNoraResponse(input);
            this.speakResponse(response);
            
            // Save this interaction to notes
            this.notes.push({
                timestamp: new Date().toISOString(),
                input: input,
                response: response
            });
            this.saveNotes();
            
        } catch (error) {
            console.error('Error:', error);
            this.speakResponse("I'm having trouble connecting right now.");
        }
        
        this.isProcessing = false;
        this.updateMicButton();
    }
    
    async getNoraResponse(userInput) {
        // Create comprehensive context from all previous notes - recent first
        let notesContext = "";
        if (this.notes.length > 0) {
            // Sort by timestamp, most recent first
            const sortedNotes = [...this.notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            notesContext = "\n\nAll previous notes and memories (most recent first):\n";
            sortedNotes.forEach((note, index) => {
                const date = new Date(note.timestamp).toLocaleDateString();
                notesContext += `[${date}] User said: "${note.input}"\nNora remembered: "${note.response}"\n\n`;
            });
            
            // Add summary of key topics if there are many notes
            if (this.notes.length > 10) {
                const topics = this.extractKeyTopics();
                notesContext += `\nKey recurring topics in notes: ${topics}\n`;
            }
        }
        
        const messages = [
            {
                role: "system",
                content: `You are Nora, a voice-only notebook assistant with perfect memory. Your job is to be the user's second brain.

CORE FUNCTIONS:
- Remember EVERYTHING the user tells you with perfect recall
- Make connections between different things they've mentioned
- Proactively remind them of related things they've said before  
- Help them recall specific details from any previous conversation
- Notice patterns and relationships in their notes

MEMORY BEHAVIOR:
- Always reference specific previous conversations when relevant
- Connect new information to things they've told you before
- Say things like "You mentioned X last week, this relates to that because..."
- If they ask about something, search ALL your notes to give complete answers
- Remember names, dates, projects, goals, ideas - everything with perfect detail

BOUNDARIES:
- ONLY discuss things from their notes and memories
- Don't provide general advice, just help with their personal information
- If asked about something not in your notes, say "I don't have any notes about that yet"

Keep responses conversational but focused on their personal information and memories.

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
                max_tokens: 150,
                temperature: 0.3
            })
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    }
    
    extractKeyTopics() {
        // Simple topic extraction from notes
        const allText = this.notes.map(note => note.input + " " + note.response).join(" ");
        const words = allText.toLowerCase().match(/\b\w{4,}\b/g) || [];
        const frequency = {};
        
        words.forEach(word => {
            if (!['that', 'this', 'with', 'have', 'they', 'were', 'said', 'from', 'will', 'about'].includes(word)) {
                frequency[word] = (frequency[word] || 0) + 1;
            }
        });
        
        return Object.entries(frequency)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 8)
            .map(([word]) => word)
            .join(", ");
    }
    
    speakResponse(text) {
        this.synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        if (this.noraVoice) {
            utterance.voice = this.noraVoice;
        }
        
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        utterance.onend = () => {
            if (this.isListening) {
                this.showStatus('Listening...');
            }
        };
        
        this.synthesis.speak(utterance);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NoraNotebook();
});
