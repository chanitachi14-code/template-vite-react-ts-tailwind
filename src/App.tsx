import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Mic, Camera, Puzzle, Star, ArrowLeft, Volume2, Sparkles } from 'lucide-react';

// --- System Variables ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  // If you export this to Vercel, replace this object with your actual Firebase config from the Firebase Console.
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'kuttikal-audio-app';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- API Helpers ---
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-preview:generateContent?key=";

async function askGemini(prompt, imageBase64 = null) {
  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        ...(imageBase64 ? [{ inlineData: { mimeType: "image/jpeg", data: imageBase64 } }] : [])
      ]
    }],
    generationConfig: { temperature: 0.7 }
  };

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "ക്ഷമിക്കണം, എനിക്ക് മനസ്സിലായില്ല."; // "Sorry, I didn't understand"
  } catch (error) {
    console.error("Gemini Error:", error);
    return "എന്തോ കുഴപ്പമുണ്ടായി."; // "Something went wrong"
  }
}

// --- Audio Helper ---
const speak = (text) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // Stop any current speech
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ml-IN'; // Use Malayalam TTS. Modern OS will read English words in this string with an Indian accent.
  utterance.rate = 0.85; // Slower for kids
  utterance.pitch = 1.2;
  window.speechSynthesis.speak(utterance);
};

// Play simple sound effects (using web audio api for beeps/boops)
const playSound = (type) => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'success') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } else if (type === 'error') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }
};

// --- Main App ---
export default function App() {
  const [user, setUser] = useState(null);
  const [stars, setStars] = useState(0);
  const [currentView, setCurrentView] = useState('home'); // home, tutor, camera, game
  const [rewardAnim, setRewardAnim] = useState(false);

  // 1. Firebase Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
        else await signInAnonymously(auth);
      } catch (e) { console.error(e); }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  // 2. Fetch Stars
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'progress');
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) setStars(snap.data().stars || 0);
      else setDoc(docRef, { stars: 0 });
    });
    return () => unsub();
  }, [user]);

  const addStars = async (amount) => {
    if (!user) return;
    playSound('success');
    setRewardAnim(true);
    setTimeout(() => setRewardAnim(false), 2000);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'progress'), { stars: stars + amount }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const navigateTo = (view, greetingText) => {
    setCurrentView(view);
    if (greetingText) speak(greetingText);
  };

  if (!user) {
    return <div className="h-screen flex items-center justify-center bg-yellow-100 text-6xl animate-pulse">🌟</div>;
  }

  return (
    <div className="min-h-screen bg-sky-100 relative overflow-hidden select-none touch-manipulation">
      
      {/* Reward Animation Overlay */}
      {rewardAnim && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="text-9xl animate-bounce drop-shadow-2xl">🌟🌟🌟</div>
        </div>
      )}

      <div className="max-w-md mx-auto bg-white min-h-screen shadow-2xl flex flex-col">
        
        {/* Top Bar - Purely Visual */}
        <div className="bg-yellow-400 p-4 flex justify-between items-center rounded-b-3xl shadow-lg z-10">
          {currentView !== 'home' ? (
            <button 
              onClick={() => navigateTo('home', 'ഹലോ! ഒരു കളി തിരഞ്ഞെടുക്കൂ.')} // "Hello! Choose a game."
              className="p-3 bg-white/30 rounded-full active:bg-white/50"
            >
              <ArrowLeft size={36} className="text-yellow-900" />
            </button>
          ) : (
            <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-4xl shadow-inner">
              👦🏽
            </div>
          )}
          
          <div className="flex items-center gap-2 bg-yellow-500/50 px-4 py-2 rounded-full border-2 border-yellow-300">
            <Star size={32} className="text-yellow-100 fill-current" />
            <span className="text-3xl font-black text-yellow-900">{stars}</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          {currentView === 'home' && <HomeView navigateTo={navigateTo} />}
          {currentView === 'tutor' && <VoiceTutor />}
          {currentView === 'camera' && <CameraScanner addStars={addStars} />}
          {currentView === 'game' && <VisualGame addStars={addStars} />}
        </div>
      </div>
    </div>
  );
}

// --- Home View ---
function HomeView({ navigateTo }) {
  // Use huge touch targets, icons, and emojis. No text.
  return (
    <div className="flex-1 flex flex-col gap-6 justify-center pb-8">
      <button 
        onClick={() => navigateTo('tutor', 'എന്നോട് സംസാരിക്കാൻ മൈക്ക് അമർത്തൂ')} // "Press mic to talk to me"
        className="flex-1 bg-gradient-to-br from-green-400 to-emerald-500 rounded-[3rem] shadow-xl flex items-center justify-center gap-6 active:scale-95 transition-transform border-b-8 border-green-600"
      >
        <span className="text-8xl">🦜</span>
        <div className="bg-white/30 p-6 rounded-full">
          <Mic size={64} className="text-white" />
        </div>
      </button>

      <button 
        onClick={() => navigateTo('camera', 'ഫോട്ടോ എടുക്കാൻ ക്യാമറ അമർത്തൂ')} // "Press camera to take a photo"
        className="flex-1 bg-gradient-to-br from-pink-400 to-rose-500 rounded-[3rem] shadow-xl flex items-center justify-center gap-6 active:scale-95 transition-transform border-b-8 border-pink-600"
      >
         <span className="text-8xl">👁️</span>
        <div className="bg-white/30 p-6 rounded-full">
          <Camera size={64} className="text-white" />
        </div>
      </button>

      <button 
        onClick={() => navigateTo('game', 'ചിത്രങ്ങൾ ചേരുമ്പടി ചേർക്കൂ')} // "Match the pictures"
        className="flex-1 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-[3rem] shadow-xl flex items-center justify-center gap-6 active:scale-95 transition-transform border-b-8 border-purple-600"
      >
        <span className="text-8xl">🧩</span>
        <div className="bg-white/30 p-6 rounded-full">
          <Puzzle size={64} className="text-white" />
        </div>
      </button>
    </div>
  );
}

// --- Voice Tutor ---
function VoiceTutor() {
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [feedbackEmoji, setFeedbackEmoji] = useState('🦜');

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      speak("നിങ്ങളുടെ ഫോണിൽ ഇത് പ്രവർത്തിക്കില്ല."); // "This won't work on your phone."
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ml-IN';
    recognition.interimResults = false;
    
    recognition.onstart = () => {
      setIsListening(true);
      setFeedbackEmoji('👂');
      playSound('success'); // gentle beep to indicate ready
    };

    recognition.onresult = async (event) => {
      setIsListening(false);
      setIsThinking(true);
      setFeedbackEmoji('🤔');
      
      const transcript = event.results[0][0].transcript;
      
      const prompt = `You are an AI teacher for an 8-year-old child in Kerala who only understands spoken Malayalam and CANNOT READ.
      The child just said this in Malayalam: "${transcript}"
      
      Instructions:
      1. Teach them ONE simple English word related to what they said.
      2. Explain what it means very warmly and simply in Malayalam.
      3. Your ENTIRE response must be meant to be read aloud by a Text-to-Speech engine. Do not include any text formatting, markdown, or emojis.
      4. Example format: "The English word is Apple. ആപ്പിൾ എന്നാൽ ഒരു ചുവന്ന പഴം ആണ്."
      
      Respond NOW in plain text:`;

      const aiResponse = await askGemini(prompt);
      setIsThinking(false);
      setFeedbackEmoji('🗣️');
      speak(aiResponse);
      
      // Reset emoji after speaking roughly
      setTimeout(() => setFeedbackEmoji('🦜'), 5000);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setFeedbackEmoji('❌');
      speak("ഒന്നുകൂടി പറയാമോ?"); // "Can you say that again?"
      setTimeout(() => setFeedbackEmoji('🦜'), 2000);
    };

    recognition.start();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-12">
      <div className={`text-9xl transition-transform duration-500 ${isListening ? 'scale-125 animate-pulse' : ''} ${isThinking ? 'animate-bounce' : ''}`}>
        {feedbackEmoji}
      </div>

      <button 
        onClick={startListening}
        disabled={isListening || isThinking}
        className={`w-64 h-64 rounded-full flex items-center justify-center shadow-2xl transition-all border-b-[12px]
          ${isListening ? 'bg-red-500 border-red-700 scale-95' : 
            isThinking ? 'bg-gray-400 border-gray-600' : 'bg-green-500 border-green-700 active:scale-95'}`}
      >
        <Mic size={96} className="text-white" />
      </button>
    </div>
  );
}

// --- Camera Scanner ---
function CameraScanner({ addStars }) {
  const [imagePreview, setImagePreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  const handleCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show Image
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);

    setIsProcessing(true);
    speak("ഞാൻ നോക്കട്ടെ..."); // "Let me look..."

    try {
      const base64Image = await new Promise((resolve) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result.split(',')[1]);
        r.readAsDataURL(file);
      });

      const prompt = `You are teaching an 8-year-old in Kerala who only understands spoken Malayalam and CANNOT READ.
      Look at this image.
      1. Identify the main object.
      2. Provide the simple English word for it.
      3. Explain what it is in one friendly sentence in Malayalam.
      4. Your ENTIRE response must be plain text to be read aloud by TTS. No formatting, no emojis.
      Example: "This is a Dog. നായ ഒരു നല്ല മൃഗമാണ്."`;

      const response = await askGemini(prompt, base64Image);
      speak(response);
      addStars(10); // Reward for scanning
    } catch (err) {
      speak("എനിക്ക് കാണാൻ കഴിയുന്നില്ല."); // "I cannot see it."
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8">
      
      {!imagePreview ? (
        <>
          <div className="text-9xl mb-8">👁️</div>
          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleCapture}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-64 h-64 bg-pink-500 rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-transform border-b-[12px] border-pink-700"
          >
            <Camera size={96} className="text-white" />
          </button>
        </>
      ) : (
        <div className="w-full flex flex-col items-center gap-6 animate-in zoom-in">
          <div className="w-full aspect-square rounded-3xl overflow-hidden border-8 border-pink-200 shadow-xl relative">
             <img src={imagePreview} className="w-full h-full object-cover" alt="Captured" />
             {isProcessing && (
               <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                 <div className="text-8xl animate-spin">✨</div>
               </div>
             )}
          </div>
          
          <button 
            onClick={() => { setImagePreview(null); speak('ഇനിയും ഫോട്ടോ എടുക്കൂ'); }} // "Take more photos"
            disabled={isProcessing}
            className="p-6 bg-gray-200 rounded-full shadow-md active:bg-gray-300"
          >
            <Camera size={48} className="text-gray-600" />
          </button>
        </div>
      )}
    </div>
  );
}

// --- Visual IQ Game ---
const levels = [
  { target: '🍎', options: ['🍌', '🍎', '🍇'] },
  { target: '🐶', options: ['🐱', '🐭', '🐶'] },
  { target: '🚗', options: ['🚗', '✈️', '⛵'] },
  { target: '⚽', options: ['🏀', '🏐', '⚽'] },
  { target: '🐘', options: ['🐅', '🐘', '🐎'] },
];

function VisualGame({ addStars }) {
  const [levelIdx, setLevelIdx] = useState(0);
  const [options, setOptions] = useState([]);
  
  const currentLevel = levels[levelIdx];

  // Shuffle options on load
  useEffect(() => {
    speak('ശരിയായ ചിത്രം കണ്ടെത്തൂ!'); // "Find the correct picture!"
    const shuffled = [...currentLevel.options].sort(() => Math.random() - 0.5);
    setOptions(shuffled);
  }, [levelIdx]);

  const handleGuess = (emoji) => {
    if (emoji === currentLevel.target) {
      playSound('success');
      addStars(5);
      speak('കൊള്ളാം! വളരെ നല്ലത്!'); // "Great! Very good!"
      setTimeout(() => {
        setLevelIdx((prev) => (prev + 1) % levels.length);
      }, 1500);
    } else {
      playSound('error');
      speak('അതല്ല, വീണ്ടും ശ്രമിക്കൂ.'); // "Not that, try again."
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-12">
      
      {/* Target to match */}
      <div className="bg-purple-100 p-8 rounded-[3rem] border-8 border-purple-200 shadow-inner">
        <div className="text-9xl">{currentLevel.target}</div>
      </div>

      <div className="text-4xl text-purple-400 font-black animate-pulse">⬇️</div>

      {/* Choices */}
      <div className="grid grid-cols-3 gap-4 w-full px-2">
        {options.map((emoji, idx) => (
          <button
            key={idx}
            onClick={() => handleGuess(emoji)}
            className="aspect-square bg-white rounded-3xl shadow-xl flex items-center justify-center text-7xl active:scale-90 transition-transform border-b-8 border-gray-200"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
