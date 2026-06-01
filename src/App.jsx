import { useRef, useState, useEffect } from "react";

export default function App() {
  const canvasRef = useRef(null);

  // --- CUSTOM ROUTER STATE ---
  const [currentPath, setCurrentPath] = useState(window.location.hash || "#/");

  // Core App States
  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(null);
  const [exportName, setExportName] = useState("lumox-export");
  
  // Interaction & Gesture States
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState(0); // For double-tap tracking
  const [initialTouchDistance, setInitialTouchDistance] = useState(null);
  const [initialTouchAngle, setInitialTouchAngle] = useState(null);
  const [initialScale, setInitialScale] = useState({ w: 0, h: 0 });
  const [initialRotation, setInitialRotation] = useState(0);

  // New UI Text Input State
  const [newText, setNewText] = useState("");

  useEffect(() => {
    const handleHashChange = () => setCurrentPath(window.location.hash || "#/");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  function navigateTo(hashPath) {
    window.location.hash = hashPath;
    setCurrentPath(hashPath);
  }

  // --- TRIGGER MOBILE VIBRATION (HAPTICS) ---
  function triggerHaptic(ms = 40) {
    if ("vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  }

  // Upload Image Layer
  function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        const scale = Math.min(500 / img.width, 350 / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;

        const newLayer = {
          id: Date.now(),
          type: "image",
          name: `Image Layer ${layers.length + 1}`,
          image: reader.result,
          visible: true,
          brightness: 100,
          contrast: 100,
          opacity: 100,
          blendMode: "source-over",
          rotation: 0, // In degrees
          x: (800 - w) / 2, 
          y: (500 - h) / 2,
          width: w,
          height: h,
          isCircleCutout: false,
          cropX: 0,
          cropY: 0,
          cropW: img.width,
          cropH: img.height,
          nativeWidth: img.width,
          nativeHeight: img.height
        };

        triggerHaptic(60);
        setLayers((prev) => [...prev, newLayer]);
        setActiveLayer(newLayer.id);
        navigateTo("#/editor");
      };
    };
    reader.readAsDataURL(file);
  }

  // Add Text Layer
  function handleAddText() {
    if (!newText.trim()) return;

    const newLayer = {
      id: Date.now(),
      type: "text",
      name: `Text: ${newText.substring(0, 10)}...`,
      textString: newText,
      textColor: "#ffffff",
      fontSize: 40,
      visible: true,
      brightness: 100, // Kept for safety maps
      contrast: 100,
      opacity: 100,
      blendMode: "source-over",
      rotation: 0,
      x: 300,
      y: 250,
      width: 200, // Approximate bounding boxes for drag capture
      height: 50,
      isCircleCutout: false,
      cropX: 0, cropY: 0, cropW: 1, cropH: 1, nativeWidth: 1, nativeHeight: 1
    };

    triggerHaptic(60);
    setLayers((prev) => [...prev, newLayer]);
    setActiveLayer(newLayer.id);
    setNewText(""); // Clear text bar
  }

  // Stack configurations
  function toggleLayer(id) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  }

  function moveLayer(index, direction) {
    setLayers((prev) => {
      const arr = [...prev];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= arr.length) return arr;
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
    triggerHaptic(30);
  }

  function deleteLayer(id) {
    triggerHaptic([40, 30, 40]);
    const freshLayers = layers.filter((l) => l.id !== id);
    setLayers(freshLayers);
    if (freshLayers.length === 0) {
      navigateTo("#/upload-image");
    } else if (activeLayer === id) {
      setActiveLayer(freshLayers[freshLayers.length - 1].id);
    }
  }

  function renameLayer(id, newName) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name: newName } : l)));
  }

  function updateActiveLayerSetting(setting, value) {
    setLayers((prev) => prev.map((l) => (l.id === activeLayer ? { ...l, [setting]: value } : l)));
  }

  // --- MATHEMATICAL TOUCH & POSITION CALCULATORS ---
  function getCanvasInputPos(e) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  // Calculate distance between two coordinate variables
  function getDistance(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }

  // Calculate angle between two coordinate variables
  function getAngle(t1, t2) {
    return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
  }

  function handleStart(e) {
    // 1. PINCH-ZOOM / GESTURE CAPTURE MECHANIC
    if (e.touches && e.touches.length === 2) {
      const layer = layers.find(l => l.id === activeLayer);
      if (layer) {
        setIsDragging(false);
        setInitialTouchDistance(getDistance(e.touches[0], e.touches[1]));
        setInitialTouchAngle(getAngle(e.touches[0], e.touches[1]));
        setInitialScale({ w: layer.width, h: layer.height });
        setInitialRotation(layer.rotation);
      }
      return;
    }

    // 2. STANDARD TARGET CLICK & TAP DOWN
    const pos = getCanvasInputPos(e);
    const clickedLayer = [...layers].reverse().find(l => {
      return l.visible && 
             pos.x >= l.x && pos.x <= l.x + l.width &&
             pos.y >= l.y && pos.y <= l.y + l.height;
    });

    if (clickedLayer) {
      // Double tap detector logic
      const now = Date.now();
      if (now - lastTap < 250 && activeLayer === clickedLayer.id) {
        // DOUBLE TAP TARGET DETECTED -> Reset position & transformations
        triggerHaptic([50, 50]);
        setLayers(prev => prev.map(l => (l.id === activeLayer ? { ...l, x: (800 - l.width) / 2, y: (500 - l.height) / 2, rotation: 0 } : l)));
        setIsDragging(false);
        return;
      }
      setLastTap(now);

      if (activeLayer !== clickedLayer.id) {
        triggerHaptic(35);
        setActiveLayer(clickedLayer.id);
      }
      
      setIsDragging(true);
      setDragStart({ x: pos.x - clickedLayer.x, y: pos.y - clickedLayer.y });
    }
  }

  function handleMove(e) {
    // MULTI-TOUCH SCALE ENGINE
    if (e.touches && e.touches.length === 2 && activeLayer) {
      if (e.cancelable) e.preventDefault();
      const currentDist = getDistance(e.touches[0], e.touches[1]);
      const currentAngle = getAngle(e.touches[0], e.touches[1]);
      
      const distanceFactor = currentDist / initialTouchDistance;
      const angleDiff = currentAngle - initialTouchAngle;

      setLayers(prev => prev.map(l => {
        if (l.id === activeLayer) {
          return {
            ...l,
            width: initialScale.w * distanceFactor,
            height: initialScale.h * distanceFactor,
            rotation: initialRotation + angleDiff
          };
        }
        return l;
      }));
      return;
    }

    // STANDARD POSITION TRANSLATION ENGINE
    if (!isDragging || !activeLayer) return;
    if (e.cancelable) e.preventDefault();
    
    const pos = getCanvasInputPos(e);
    setLayers(prev => prev.map(l => {
      if (l.id === activeLayer) {
        return { ...l, x: pos.x - dragStart.x, y: pos.y - dragStart.y };
      }
      return l;
    }));
  }

  function handleEnd() {
    setIsDragging(false);
    setInitialTouchDistance(null);
    setInitialTouchAngle(null);
  }

  function downloadImage() {
    triggerHaptic(100);
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    const finalName = exportName.trim() || "lumox-export";
    link.download = `${finalName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // Core Canvas Engine Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const visibleLayers = layers.filter((l) => l.visible);
    const loadPromises = visibleLayers.map((layer) => {
      return new Promise((resolve) => {
        if (layer.type === "text") {
          resolve({ isText: true, layer });
        } else {
          const img = new Image();
          img.src = layer.image;
          img.onload = () => resolve({ img, layer });
        }
      });
    });

    Promise.all(loadPromises).then((loadedLayers) => {
      loadedLayers.forEach(({ img, layer, isText }) => {
        ctx.save();
        
        // Translate context origin to structural layer parameters center point
        const centerX = layer.x + layer.width / 2;
        const centerY = layer.y + layer.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);

        // Blending Mode Integration
        ctx.globalCompositeOperation = layer.blendMode;
        // Opacity mapping transformation
        ctx.globalAlpha = layer.opacity / 100;

        if (isText) {
          ctx.font = `bold ${layer.fontSize}px system-ui, sans-serif`;
          ctx.fillStyle = layer.textColor;
          ctx.textBaseline = "top";
          ctx.fillText(layer.textString, layer.x, layer.y);
        } else {
          if (layer.isCircleCutout) {
            ctx.beginPath();
            const radius = Math.min(layer.width, layer.height) / 2;
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.clip();
          }
          ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%)`;
          ctx.drawImage(img, layer.cropX, layer.cropY, layer.cropW, layer.cropH, layer.x, layer.y, layer.width, layer.height);
        }
        
        ctx.restore();
      });
    });
  }, [layers, currentPath]);

  const currentLayerData = layers.find((l) => l.id === activeLayer);
  const panelHeaderStyle = { margin: "0 0 15px 0", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "#8a9ba8", fontWeight: "bold" };
  const controlBtnStyle = { background: "#2d2d2d", color: "#fff", border: "none", padding: "6px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" };

  // --- SCREEN LAYOUTS ---
  if (currentPath === "#/" || currentPath === "") {
    return (
      <div style={{ backgroundColor: "#121212", color: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif", padding: "20px", textAlign: "center" }}>
        <h1 style={{ fontSize: "46px", margin: "0 0 10px 0", background: "linear-gradient(45deg, #0070f3, #00dfd8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontWeight: "900" }}>Lumox VE</h1>
        <p style={{ color: "#777", fontSize: "16px", marginBottom: "35px" }}>Mobile Pro Studio Editor Pipeline</p>
        <button onClick={() => { triggerHaptic(50); navigateTo("#/upload-image"); }} style={{ padding: "14px 36px", backgroundColor: "#0070f3", color: "#fff", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: "bold" }}>
          Open Engine Workspace
        </button>
      </div>
    );
  }

  if (currentPath === "#/upload-image") {
    return (
      <div style={{ backgroundColor: "#121212", color: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif", padding: "20px" }}>
        <div style={{ backgroundColor: "#1e1e1e", padding: "30px 20px", borderRadius: "16px", border: "1px solid #2d2d2d", textAlign: "center", maxWidth: "400px", width: "100%", boxSizing: "border-box" }}>
          <h2 style={{ margin: "0 0 8px 0", fontSize: "22px" }}>Load Media Layer</h2>
          <p style={{ color: "#666", fontSize: "13px", marginBottom: "25px" }}>Import a base layout asset to build your canvas.</p>
          <label style={{ display: "block", padding: "30px 15px", border: "2px dashed #0070f3", borderRadius: "12px", cursor: "pointer", backgroundColor: "#151515", color: "#0070f3", fontWeight: "bold" }}>
            📷 Import From Storage
            <input type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#121212", color: "#e1e1e1", fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* HEADER CONTROLS BAR */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1e1e1e", padding: "10px 15px", borderBottom: "1px solid #2d2d2d" }}>
        <h1 onClick={() => navigateTo("#/")} style={{ margin: 0, fontSize: "18px", fontWeight: "900", background: "linear-gradient(45deg, #0070f3, #00dfd8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Lumox Studio</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <input type="text" value={exportName} onChange={(e) => setExportName(e.target.value)} style={{ background: "#2d2d2d", border: "none", padding: "6px 10px", borderRadius: "4px", color: "#fff", fontSize: "12px", width: "110px", textAlign: "center" }} />
          <button onClick={downloadImage} style={{ padding: "6px 14px", backgroundColor: "#0070f3", color: "#fff", border: "none", borderRadius: "4px", fontWeight: "bold", fontSize: "12px" }}>Save PNG</button>
        </div>
      </header>

      {/* WORKSPACE COMPONENT WRAPPER */}
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, overflowY: "auto" }}>
        
        {/* VIEWPORT GRAPHIC BOX */}
        <div style={{ backgroundColor: "#0f0f0f", display: "flex", justifyContent: "center", alignItems: "center", padding: "15px", minHeight: "340px" }}>
          <div style={{ padding: "4px", backgroundColor: "#1e1e1e", borderRadius: "8px", maxWidth: "100%" }}>
            <canvas 
              ref={canvasRef} width={800} height={500} 
              onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleEnd} onMouseLeave={handleEnd}
              onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd}
              style={{ display: "block", maxWidth: "100%", height: "auto", borderRadius: "4px", background: "repeating-conic-gradient(#252525 0% 25%, #1e1e1e 0% 50%) 50% / 16px 16px" }} 
            />
          </div>
        </div>

        {/* OPERATIONS GRID */}
        <div style={{ display: "flex", flexDirection: "row", flexGrow: 1, borderTop: "1px solid #2d2d2d" }}>
          
          {/* LAYERS DRAWER BLOCK */}
          <div style={{ flex: 1, backgroundColor: "#1e1e1e", borderRight: "1px solid #2d2d2d", padding: "12px", display: "flex", flexDirection: "column" }}>
            <h4 style={panelHeaderStyle}>Layers Control</h4>
            
            {/* QUICK TEXT ADD TOOL */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "15px" }}>
              <input type="text" placeholder="Type text..." value={newText} onChange={(e) => setNewText(e.target.value)} style={{ flexGrow: 1, background: "#151515", border: "1px solid #3a3a3a", padding: "6px", borderRadius: "4px", color: "#fff", fontSize: "12px" }} />
              <button onClick={handleAddText} style={{ ...controlBtnStyle, backgroundColor: "#0070f3" }}>Add Text</button>
            </div>

            <label style={{ display: "block", padding: "8px", textAlign: "center", border: "1px dashed #3a3a3a", borderRadius: "4px", color: "#aaa", fontSize: "11px", backgroundColor: "#151515", marginBottom: "10px", cursor: "pointer" }}>
              🖼️ Add Photo Layer
              <input type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
            </label>

            <div style={{ display: "flex", flexDirection: "column-reverse", gap: "6px" }}>
              {layers.map((layer, index) => (
                <div key={layer.id} onClick={() => setActiveLayer(layer.id)} style={{ padding: "8px", borderRadius: "6px", border: activeLayer === layer.id ? "1px solid #0070f3" : "1px solid #2d2d2d", background: activeLayer === layer.id ? "#1a2436" : "#151515" }}>
                  <input type="text" value={layer.name} onClick={(e) => e.stopPropagation()} onChange={(e) => renameLayer(layer.id, e.target.value)} style={{ width: "100%", fontSize: "12px", border: "none", background: "transparent", color: "#fff", outline: "none", fontWeight: "bold" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id); }} style={controlBtnStyle}>{layer.visible ? "👁️" : "📁"}</button>
                      <button onClick={(e) => { e.stopPropagation(); moveLayer(index, 1); }} style={controlBtnStyle}>⬆</button>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} style={{ ...controlBtnStyle, color: "#ff4d4f" }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* INSPECTOR SLIDERS BLOCK */}
          <div style={{ flex: 1, backgroundColor: "#1e1e1e", padding: "12px", overflowY: "auto", boxSizing: "border-box" }}>
            <h4 style={panelHeaderStyle}>Inspector Attributes</h4>
            
            {currentLayerData ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "12px" }}>
                
                {/* COMPOSITING ATTRIBUTES */}
                <div>
                  <label style={{ display: "block", marginBottom: "4px", color: "#aaa" }}>Layer Opacity ({currentLayerData.opacity}%)</label>
                  <input type="range" min="0" max="100" value={currentLayerData.opacity} onChange={(e) => updateActiveLayerSetting("opacity", Number(e.target.value))} style={{ width: "100%" }} />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", color: "#aaa" }}>Blend Mode</label>
                  <select value={currentLayerData.blendMode} onChange={(e) => updateActiveLayerSetting("blendMode", e.target.value)} style={{ width: "100%", background: "#2d2d2d", color: "#fff", border: "none", padding: "6px", borderRadius: "4px" }}>
                    <option value="source-over">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="darken">Darken</option>
                    <option value="lighten">Lighten</option>
                  </select>
                </div>

                {/* TEXT ATTRIBUTE MODIFIERS */}
                {currentLayerData.type === "text" ? (
                  <>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", color: "#aaa" }}>Text Color</label>
                      <input type="color" value={currentLayerData.textColor} onChange={(e) => updateActiveLayerSetting("textColor", e.target.value)} style={{ width: "100%", height: "30px", border: "none", background: "transparent" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", color: "#aaa" }}>Font Size ({currentLayerData.fontSize}px)</label>
                      <input type="range" min="10" max="120" value={currentLayerData.fontSize} onChange={(e) => updateActiveLayerSetting("fontSize", Number(e.target.value))} style={{ width: "100%" }} />
                    </div>
                  </>
                ) : (
                  /* GRAPHICS ATTRIBUTE MODIFIERS */
                  <>
                    <div>
                      <button onClick={() => updateActiveLayerSetting("isCircleCutout", !currentLayerData.isCircleCutout)} style={{ width: "100%", padding: "8px", backgroundColor: currentLayerData.isCircleCutout ? "#1e3a2f" : "#252525", border: "none", color: currentLayerData.isCircleCutout ? "#4ade80" : "#ccc", borderRadius: "4px", fontSize: "11px", fontWeight: "bold" }}>
                        {currentLayerData.isCircleCutout ? "🟢 Circle Mask On" : "⚪ Circle Mask Off"}
                      </button>
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px" }}>Brightness ({currentLayerData.brightness}%)</label>
                      <input type="range" min="0" max="200" value={currentLayerData.brightness} onChange={(e) => updateActiveLayerSetting("brightness", Number(e.target.value))} style={{ width: "100%" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px" }}>Contrast ({currentLayerData.contrast}%)</label>
                      <input type="range" min="0" max="200" value={currentLayerData.contrast} onChange={(e) => updateActiveLayerSetting("contrast", Number(e.target.value))} style={{ width: "100%" }} />
                    </div>
                  </>
                )}

                <p style={{ fontSize: "10px", color: "#555", textAlign: "center", margin: "10px 0 0 0" }}>💡 Tip: Double tap a layer inside the canvas monitor window to reset its scale/position center lines.</p>
              </div>
            ) : (
              <p style={{ color: "#555", fontStyle: "italic", textAlign: "center" }}>Tap on a layer card to load parameters.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
