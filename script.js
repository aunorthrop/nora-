class NoraVoiceAssistant {
    constructor() {
        this.apiKey = null;
        this.isListening = false;
        this.isProcessing = false;
        this.conversation = [];
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
        this.chatContainer = document.getElementById('chatContainer');
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
            this.showStatus('Speech recognition not supported in this browser');
            return;
        }
        
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        
        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateMicButton();
            this.showStatus('Listening... speak naturally');
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
            this.showStatus('Speech recognition error. Try again.');
            this.stopListening();
        };
        
        this.recognition.onend = () => {
            if (this.isListening) {
                // Restart recognition if we're still supposed to be listening
                setTimeout(() => {
                    if (this.isListening) {
                        this.recognition.start();
                    }
                }, 100);
            }
        };
    }
    
    setupSpeechSynthesis() {
        // Wait for voices to load
        const setVoice = () => {
            const voices = this.synthesis.getVoices();
            // Try to find a good female voice
            this.noraVoice = voices.find(voice => 
                voice.name.includes('Female') || 
                voice.name.includes('Samantha') ||
                voice.name.includes('Victoria') ||
                voice.name.includes('Karen') ||
                voice.gender === 'female'
            ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0];
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
                this.apiKey = key;
                localStorage.setItem('openai_api_key', key);
                this.apiSetup.classList.add('hidden');
                this.showStatus('API key saved. Press microphone to start');
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
            this.showStatus('Listening...');
        }
    }
    
    stopListening() {
        this.isListening = false;
        if (this.recognition) {
            this.recognition.stop();
        }
        this.updateMicButton();
        this.showStatus('Conversation ended. Press microphone to start new session');
        // Clear conversation history when session ends
        this.conversation = [];
    }
    
    updateMicButton() {
        const micText = this.micButton.querySelector('.mic-text');
        
        if (this.isProcessing) {
            this.micButton.className = 'mic-button processing';
            micText.textContent = 'Processing...';
        } else if (this.isListening) {
            this.micButton.className = 'mic-button listening';
            micText.textContent = 'End Session';
        } else {
            this.micButton.className = 'mic-button';
            micText.textContent = 'Start Conversation';
        }
    }
    
    showStatus(message) {
        this.status.textContent = message;
    }
    
    addMessage(content, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
        
        messageDiv.innerHTML = `
            <div class="avatar">${isUser ? 'Y' : 'N'}</div>
            <div class="content">${content}</div>
        `;
        
        this.chatContainer.appendChild(messageDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
    
    async processUserInput(input) {
        this.addMessage(input, true);
        this.isProcessing = true;
        this.updateMicButton();
        this.showStatus('Nora is thinking...');
        
        try {
            const response = await this.getNoraResponse(input);
            this.addMessage(response);
            this.speakResponse(response);
        } catch (error) {
            console.error('Error getting response:', error);
            const errorMsg = "I'm having trouble connecting right now. Can you try again?";
            this.addMessage(errorMsg);
            this.speakResponse(errorMsg);
        }
        
        this.isProcessing = false;
        this.updateMicButton();
        this.showStatus('Listening... speak naturally');
    }
    
    async getNoraResponse(userInput) {
        // Add user input to conversation history
        this.conversation.push({
            role: "user",
            content: userInput
        });
        
        const messages = [
            {
                role: "system",
                content: `You are Nora, a friendly voice assistant who helps with note-taking and remembers conversations. 

Key personality traits:
- Warm, conversational, and personable
- Remember details from earlier in the conversation
- Make connections between things the user mentions
- Proactively remind them of things they mentioned wanting to do
- Keep responses concise but thoughtful (1-3 sentences usually)

IMPORTANT BOUNDARIES - Be polite but don't provide:
- Legal advice or legal topics
- Medical or health advice 
- Financial advice or investment guidance
- Inappropriate content

For these topics, say something like "I can't help with that type of advice, but I'm happy to chat about other things!"

Focus on being a great conversational companion who remembers and connects ideas.`
            },
            ...this.conversation
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
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        const assistantResponse = data.choices[0].message.content;
        
        // Add assistant response to conversation history
        this.conversation.push({
            role: "assistant", 
            content: assistantResponse
        });
        
        return assistantResponse;
    }
    
    speakResponse(text) {
        // Cancel any ongoing speech
        this.synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        if (this.noraVoice) {
            utterance.voice = this.noraVoice;
        }
        
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        utterance.onstart = () => {
            this.showStatus('Nora is speaking...');
        };
        
        utterance.onend = () => {
            if (this.isListening) {
                this.showStatus('Listening... speak naturally');
            }
        };
        
        this.synthesis.speak(utterance);
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new NoraVoiceAssistant();
});
