// public/assets/safeai.i18n.js
(function(global){
  const STR = {
    en: {
      "tabs.safe":"🛡️ Safe-AI","tabs.music":"🎶 Music-AI","tabs.universe":"🌌 Universe","tabs.qpu":"🧠 Hybrid-QPU","tabs.insights":"📈 Transparency",
      "safe.status.soft":"Software Fallback","safe.action.connect":"Connect FPGA","safe.label.path":"Compute Path","safe.path.soft":"Software fallback",
      "safe.label.model":"Model","safe.label.guards":"Guardrails","safe.guard.none":"None","safe.hint":"When FPGA is connected, the compute path flips to Hybrid (Hardware-backed) and each answer is tagged with provenance.",
      "safe.send":"Send",
      "music.title":"Abqeri Music-AI — Humane Synthesis","music.presets":"Presets","music.load":"Load","music.hint":"Then Generate → Play","music.tempo":"Tempo","music.generate":"Generate","music.play":"Play","music.note":"Local WebAudio synth; melody notes appear at right.",
      "uni.mode":"Mode","uni.bodies":"Bodies / Photons","uni.gravity":"Gravity / Coupling","uni.drag":"Damping / Decoherence","uni.start":"Start","uni.pause":"Pause","uni.reset":"Reset",
      "ins.live":"Live Summary","ins.chart":"30-day Chart",
      "footer":"Technology with Mercy for Humanity"
    },
    ar: {
      "tabs.safe":"🛡️ الذكاء الآمن","tabs.music":"🎶 موسيقى-ذكاء","tabs.universe":"🌌 الكون","tabs.qpu":"🧠 المعالج الهجين","tabs.insights":"📈 الشفافية",
      "safe.status.soft":"وضع برمجي","safe.action.connect":"اتصال بـ FPGA","safe.label.path":"مسار الحوسبة","safe.path.soft":"برمجي احتياطي",
      "safe.label.model":"النموذج","safe.label.guards":"حواجز الأمان","safe.guard.none":"لا يوجد","safe.hint":"عند توصيل الـFPGA يتحول المسار إلى «هجين (مدعوم عتاديًا)» وتُوَسَّم كل إجابة بالمصدر.",
      "safe.send":"إرسال",
      "music.title":"موسيقى-ذكاء من عبقري — تأليف إنساني","music.presets":"الأنماط","music.load":"تحميل","music.hint":"ثم توليد → تشغيل","music.tempo":"السرعة","music.generate":"توليد","music.play":"تشغيل","music.note":"توليد محلي عبر WebAudio؛ تظهر النغمات على اليمين.",
      "uni.mode":"النمط","uni.bodies":"الأجسام/الفوتونات","uni.gravity":"الجذب/الاقتران","uni.drag":"التخميد/فقد الترابط","uni.start":"بدء","uni.pause":"إيقاف مؤقت","uni.reset":"تصفير",
      "ins.live":"ملخص مباشر","ins.chart":"مخطط 30 يومًا",
      "footer":"تكنولوجيا برحمة من أجل الإنسانية"
    },
    ru: {
      "tabs.safe":"🛡️ Безопасный ИИ","tabs.music":"🎶 Музыкальный ИИ","tabs.universe":"🌌 Вселенная","tabs.qpu":"🧠 Гибрид-QPU","tabs.insights":"📈 Прозрачность",
      "safe.status.soft":"Программный режим","safe.action.connect":"Подключить FPGA","safe.label.path":"Путь вычислений","safe.path.soft":"Программный фолбэк",
      "safe.label.model":"Модель","safe.label.guards":"Ограничители","safe.guard.none":"Нет","safe.hint":"При подключении FPGA путь меняется на «Гибрид (аппаратная поддержка)», а ответы получают метку происхождения.",
      "safe.send":"Отправить",
      "music.title":"Музыкальный ИИ Abqeri — гуманная синтезия","music.presets":"Пресеты","music.load":"Загрузить","music.hint":"Затем Generate → Play","music.tempo":"Темп","music.generate":"Сгенерировать","music.play":"Воспроизвести","music.note":"Локальный WebAudio-синтез; ноты справа.",
      "uni.mode":"Режим","uni.bodies":"Частицы/фотоны","uni.gravity":"Гравитация/связь","uni.drag":"Затухание/декогеренция","uni.start":"Старт","uni.pause":"Пауза","uni.reset":"Сброс",
      "ins.live":"Живое резюме","ins.chart":"График 30 дней",
      "footer":"Технологии с милосердием для человечества"
    },
    zh: {
      "tabs.safe":"🛡️ 安全AI","tabs.music":"🎶 音乐AI","tabs.universe":"🌌 宇宙模拟","tabs.qpu":"🧠 混合QPU","tabs.insights":"📈 透明度",
      "safe.status.soft":"软件回退","safe.action.connect":"连接FPGA","safe.label.path":"计算路径","safe.path.soft":"软件回退",
      "safe.label.model":"模型","safe.label.guards":"安全护栏","safe.guard.none":"无","safe.hint":"连接FPGA后将切换为「混合（硬件支持）」并对每个答案标注来源。",
      "safe.send":"发送",
      "music.title":"Abqeri 音乐AI — 人本合成","music.presets":"预设","music.load":"载入","music.hint":"然后 生成 → 播放","music.tempo":"速度","music.generate":"生成","music.play":"播放","music.note":"本地 WebAudio 合成；右侧显示音符。",
      "uni.mode":"模式","uni.bodies":"粒子/光子数","uni.gravity":"引力/耦合","uni.drag":"阻尼/退相干","uni.start":"开始","uni.pause":"暂停","uni.reset":"重置",
      "ins.live":"实时概览","ins.chart":"30天曲线",
      "footer":"以仁慈为人类服务的科技"
    }
  };
  function applyAll(lang){
    const t = STR[lang] || STR.en;
    document.querySelectorAll("[data-i18n]").forEach(el=>{
      const k = el.getAttribute("data-i18n");
      if (t[k]) el.textContent = t[k];
    });
    // textarea placeholder per lang
    const ta = document.getElementById('chatInput');
    if (ta) ta.placeholder = (lang==='ar'?'اكتب رسالتك… (إنتر للإرسال)':
                              lang==='ru'?'Введите сообщение… (Enter — отправить)':
                              lang==='zh'?'输入你的消息…（回车发送）':
                              'Type your message… (Enter to send)');
  }
  global.AbqSafeI18N = { applyAll };
})(window);
