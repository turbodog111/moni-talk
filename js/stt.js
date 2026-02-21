// ====== SPEECH-TO-TEXT (Voice Input) ======
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const sttSupported = !!SpeechRecognition;
let sttActive = false;
let recognition = null;

function initSTT() {
  if (!sttSupported) return;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (e) => {
    let transcript = '';
    for (let i = 0; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    const input = $('userInput');
    if (input) {
      input.value = transcript;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  recognition.onend = () => {
    sttActive = false;
    const btn = $('micBtn');
    if (btn) btn.classList.remove('recording');
  };

  recognition.onerror = (e) => {
    sttActive = false;
    const btn = $('micBtn');
    if (btn) btn.classList.remove('recording');
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      showToast('Mic error: ' + e.error);
    }
  };
}

function toggleSTT() {
  if (!recognition) return;
  if (sttActive) {
    stopSTT();
  } else {
    try {
      recognition.start();
      sttActive = true;
      const btn = $('micBtn');
      if (btn) btn.classList.add('recording');
    } catch (err) {
      showToast('Could not start mic: ' + err.message);
    }
  }
}

function stopSTT() {
  if (!recognition || !sttActive) return;
  recognition.stop();
  sttActive = false;
  const btn = $('micBtn');
  if (btn) btn.classList.remove('recording');
}

function showMicButton() {
  const btn = $('micBtn');
  if (btn) btn.style.display = '';
}

function hideMicButton() {
  const btn = $('micBtn');
  if (btn) btn.style.display = 'none';
}
