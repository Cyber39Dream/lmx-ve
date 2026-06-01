import { useRef, useState, useEffect } from "react";

export default function App() {
  const canvasRef = useRef(null);

  // Custom Router State for Netlify / WebIntoApp APK
  const [currentPath, setCurrentPath] = useState(window.location.hash || "#/");

  // Core App States
  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(null);
  const [exportName, setExportName] = useState("lumox-export");
  
  // Tool Modes: "move", "crop", "cutout"
  const [editMode, setEditMode] = useState("move");

  // Interaction & Touch States
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState(0);
  const [activeHandle, setActiveHandle] = useState(null); // Tracking crop box corners

  // Sync Router Hash
  useEffect(() => {
    const handleHashChange = () => setCurrentPath(window.location.hash || "#/");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  function navigateTo(hashPath) {
    window.location.hash = hashPath;
    setCurrentPath(hashPath);
  }

  function triggerHaptic(ms = 40) {
    if ("vibrate" in navigator) navigator.vibrate(ms);
  }

  // Upload Layer Setup
  function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        const scale = Math.min(600 / img.width, 400 / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;

        const newLayer = {
          id: Date.now(),
          type: "image",
          name: `Layer ${layers.length + 1}`,
          image: reader.result,
          visible: true,
          brightness: 100,
          contrast: 100,
          opacity: 100,
          blendMode: "source-over",
          x: (800 - w) / 2, 
          y: (500 - h) / 2,
          width: w,
          height: h,
          
          // True Cropping Coordinates (relative to original image sizing)
          cropX: 0,
          cropY: 0,
          cropW: img.width,
          cropH: img.height,
          
          // True Cutout/Masking Type: "none", "circle", "rect"
          cutoutType: "none",
          cutoutX: 0,
          cutoutY: 0,
          cutoutW: w,
          cutoutH: h,

          nativeWidth: img.width,
          nativeHeight: img.height
        };

        triggerHaptic(50);
        setLayers((prev) => [...prev, newLayer]);
        setActiveLayer(newLayer.id);
        navigateTo("#/editor");
      };
    };
    reader.readAsDataURL(file);
  }

  function updateActiveLayerSetting(setting, value) {
    setLayers((prev) => prev.map((l) => (l.id === activeLayer ? { ...l, [setting]: value } : l)));
  }

  // --- INTERACTIVE TOUCH & INPUT COORDINATE MAPPING ---
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

  function handleStart(e) {
    const pos = getCanvasInputPos(e);
    const layer = layers.find(l => l.id === activeLayer);

    // CROP MODE INTERACTION: Checking corner handles
    if (editMode === "crop" && layer) {
      const handleSize = 20;
      // Right-Bottom Corner Handle Check
      if (Math.abs(pos.x - (layer.x + layer.width)) < handleSize && Math.abs(pos.y - (layer.y + layer.height)) < handleSize) {
        setActiveHandle("bottom-right");
        setIsDragging(true);
        return;
      }
    }

    // NORMAL MODE: Finding clicked layer
    const clickedLayer = [...layers].reverse().find(l => {
      return l.visible && 
             pos.x >= l.x && pos.x <= l.x + l.width &&
             pos.y >= l.y && pos.y <= l.y + l.height;
    });

    if (clickedLayer) {
      const now = Date.now();
      if (now - lastTap < 250 && activeLayer === clickedLayer.id) {
        // Double tap resets transformations
        triggerHaptic([40, 40]);
        setLayers(prev => prev.map(l => (l.id === activeLayer ? { ...l, x: (800 - l.width) / 2, y: (500 - l.height) / 2 } : l)));
        return;
      }
      setLastTap(now);

      if (activeLayer !== clickedLayer.id) {
        triggerHaptic(30);
        setActiveLayer(clickedLayer.id);
      }
      
      if (editMode === "move") {
        setIsDragging(true);
        setDragStart({ x: pos.x - clickedLayer.x, y: pos.y - clickedLayer.y });
      }
    }
  }

  function handleMove(e) {
    if (!isDragging || !activeLayer) return;
    if (e.cancelable) e.preventDefault();
    const pos = getCanvasInputPos(e);

    setLayers(prev => prev.map(l => {
      if (l.id === activeLayer) {
        // If altering crop limits dynamically via corner handles
        if (editMode === "crop" && activeHandle === "bottom-right") {
          const newWidth = Math.max(40, pos.x - l.x);
          const newHeight = Math.max(40, pos.y - l.y);
          
          // Map visual bounding changes back safely onto native image pixel space
          const scaleX = l.nativeWidth / (l.width || 1);
          const scaleY = l.nativeHeight / (l.height || 1);

          return {
            ...l,
            cropW: Math.min(l.nativeWidth, newWidth * scaleX),
            cropH: Math.min(l.nativeHeight, newHeight * scaleY),
            width: newWidth,
            height: newHeight
          };
        }

        // Standard Layer Moving
        if (editMode === "move") {
          return { ...l, x: pos.x - dragStart.x, y: pos.y - dragStart.y };
        }
      }
      return l;
    }));
  }

  function handleEnd() {
    setIsDragging(false);
    setActiveHandle(null);
  }

  // Clear Canvas Stack
  function deleteLayer(id) {
    triggerHaptic(40);
    const remaining = layers.filter(l => l.id !== id);
    setLayers(remaining);
    if (remaining.length === 0) navigateTo("#/upload-image");
  }

  // --- CANVAS CORE DRAW & FILTER PIPELINE ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const loadPromises = layers.filter(l => l.visible).map((layer) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = layer.image;
        img.onload = () => resolve({ img, layer });
      });
    });

    Promise.all(loadPromises).then((loadedLayers) => {
      loadedLayers.forEach(({ img, layer }) => {
        ctx.save();
        
        ctx.globalCompositeOperation = layer.blendMode;
        ctx.globalAlpha = layer.opacity / 100;

        // Apply Cutout Masks directly onto context rendering coordinates
        if (layer.cutoutType === "circle") {
          ctx.beginPath();
          const cx = layer.x + layer.width / 2;
          const cy = layer.y + layer.height / 2;
          const radius = Math.min(layer.width, layer.height) / 2;
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.clip();
        } else if (layer.cutoutType === "rect") {
          ctx.beginPath();
          ctx.rect(layer.x + 20, layer.y + 20, layer.width - 40, layer.height - 40);
          ctx.clip();
        }

        // Color Processing Filters
        ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%)`;

        // Render cropped source values into target workspace dimensions
        ctx.drawImage(
          img,
          layer.cropX, layer.cropY, layer.cropW, layer.cropH,
          layer.x, layer.y, layer.width, layer.height
        );

        // Draw active interactive bounding indicators if editMode is active
        if (editMode === "crop" && layer.id === activeLayer) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#0070f3";
          ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
          
          // Anchor handle target
          ctx.fillStyle = "#00dfd8";
          ctx.fillRect(layer.x + layer.width - 10, layer.y + layer.height - 10, 15, 15);
        }

        ctx.restore();
      });
    });
  }, [layers, currentPath, editMode, activeLayer]);

  function downloadImage() {
    triggerHaptic(80);
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = `${exportName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  const currentLayerData = layers.find((l) => l.id === activeLayer);

  // --- ROUTER VIEW ROUTING ---
  if (currentPath === "#/" || currentPath === "") {
    return (
      <div style={{ backgroundColor: "#121212", color: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif", textAlign: "center", padding: "20px" }}>
        <h1 style={{ fontSize: "42px", margin: "0", background: "linear-gradient(45deg, #0070f3, #00dfd8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontWeight: "900" }}>Lumox VE</h1>
        <p style={{ color: "#666", marginBottom: "30px" }}>Precision Mobile Cropping & Cutout Studio</p>
        <button onClick={() => navigateTo("#/upload-image")} style={{ padding: "12px 30px", backgroundColor: "#0070f3", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold" }}>Start Project</button>
      </div>
    );
  }

  if (currentPath === "#/upload-image") {
    return (
      <div style={{ backgroundColor: "#121212", color: "#fff", minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif" }}>
        <div style={{ backgroundColor: "#1e1e1e", padding: "30px", borderRadius: "12px", border: "1px solid #2d2d2d", textAlign: "center", width: "90%", maxWidth: "360px" }}>
          <h3 style={{ margin: "0 0 10px 0" }}>Import Image Asset</h3>
          <label style={{ display: "block", padding: "30px 10px", border: "2px dashed #0070f3", borderRadius: "8px", cursor: "pointer", color: "#0070f3", fontWeight: "bold", backgroundColor: "#151515" }}>
            Select File
            <input type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#121212", color: "#e1e1e1", fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* APP TOP HEADER */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1e1e1e", padding: "10px", borderBottom: "1px solid #2d2d2d" }}>
        <span onClick={() => navigateTo("#/ text")} style={{ fontWeight: "bold", background: "linear-gradient(45deg, #0070f3, #00dfd8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Lumox Workspace</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <input type="text" value={exportName} onChange={(e) => setExportName(e.target.value)} style={{ background: "#2d2d2d", border: "none", color: "#fff", padding: "4px 8px", borderRadius: "4px", width: "100px", fontSize: "12px" }} />
          <button onClick={downloadImage} style={{ background: "#0070f3", color: "#fff", border: "none", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" }}>Save</button>
        </div>
      </header>

      {/* CORE VIEWPORT */}
      <div style={{ backgroundColor: "#0f0f0f", display: "flex", justifyContent: "center", alignItems: "center", padding: "10px", minHeight: "320px", flexGrow: 1 }}>
        <div style={{ padding: "4px", backgroundColor: "#1e1e1e", borderRadius: "8px", maxWidth: "100%" }}>
          <canvas 
            ref={canvasRef} width={800} height={500}
            onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleEnd} onMouseLeave={handleEnd}
            onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd}
            style={{ display: "block", maxWidth: "100%", height: "auto", background: "repeating-conic-gradient(#252525 0% 25%, #1e1e1e 0% 50%) 50% / 16px 16px" }}
          />
        </div>
      </div>

      {/* MOBILE LOWER TOOL CONTROLS FOOTER */}
      <div style={{ backgroundColor: "#1e1e1e", borderTop: "1px solid #2d2d2d", padding: "12px" }}>
        
        {/* MODE ACTIONS SELECTOR */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "15px", justifyContent: "center" }}>
          <button onClick={() => setEditMode("move")} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", backgroundColor: editMode === "move" ? "#0070f3" : "#2d2d2d", color: "#fff" }}>
            🖐️ Drag & Move
          </button>
          <button onClick={() => { setEditMode("crop"); triggerHaptic(20); }} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", backgroundColor: editMode === "crop" ? "#0070f3" : "#2d2d2d", color: "#fff" }}>
            📐 Crop Canvas Box
          </button>
        </div>

        {/* DETAILED INSPECTION SUBPANEL */}
        {currentLayerData ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "500px", margin: "0 auto", fontSize: "12px" }}>
            
            {/* REAL-TIME DYNAMIC CUTOUT ACTION BUTTONS */}
            <div style={{ borderBottom: "1px solid #2d2d2d", paddingBottom: "10px" }}>
              <span style={{ display: "block", color: "#8a9ba8", fontWeight: "bold", marginBottom: "6px", fontSize: "10px" }}>ISOLATED SHAPE CUTOUTS</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => updateActiveLayerSetting("cutoutType", "none")} style={{ flex: 1, padding: "6px", borderRadius: "4px", border: "none", backgroundColor: currentLayerData.cutoutType === "none" ? "#3a3a3a" : "#2d2d2d", color: "#fff" }}>No Cutout</button>
                <button onClick={() => { updateActiveLayerSetting("cutoutType", "circle"); triggerHaptic(30); }} style={{ flex: 1, padding: "6px", borderRadius: "4px", border: "none", backgroundColor: currentLayerData.cutoutType === "circle" ? "#137333" : "#2d2d2d", color: currentLayerData.cutoutType === "circle" ? "#4ade80" : "#fff" }}>🟢 Circle Clip</button>
                <button onClick={() => { updateActiveLayerSetting("cutoutType", "rect"); triggerHaptic(30); }} style={{ flex: 1, padding: "6px", borderRadius: "4px", border: "none", backgroundColor: currentLayerData.cutoutType === "rect" ? "#137333" : "#2d2d2d", color: currentLayerData.cutoutType === "rect" ? "#4ade80" : "#fff" }}>⬛ Square Border</button>
              </div>
            </div>

            {/* QUICK TRANSFORMS LAYER STACK UTILS */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>Editing: <span style={{ color: "#00dfd8", fontWeight: "bold" }}>{currentLayerData.name}</span></div>
              <button onClick={() => deleteLayer(currentLayerData.id)} style={{ background: "rgba(255,77,79,0.15)", color: "#ff4d4f", border: "none", padding: "4px 10px", borderRadius: "4px" }}>Delete Layer 🗑️</button>
            </div>

            {/* COMPOSITING FILTERS SLIDERS */}
            <div style={{ display: "flex", gap: "10px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: "#aaa", display: "block", marginBottom: "2px" }}>Opacity ({currentLayerData.opacity}%)</label>
                <input type="range" min="0" max="100" value={currentLayerData.opacity} onChange={(e) => updateActiveLayerSetting("opacity", Number(e.target.value))} style={{ width: "100%" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ color: "#aaa", display: "block", marginBottom: "2px" }}>Brightness ({currentLayerData.brightness}%)</label>
                <input type="range" min="0" max="200" value={currentLayerData.brightness} onChange={(e) => updateActiveLayerSetting("brightness", Number(e.target.value))} style={{ width: "100%" }} />
              </div>
            </div>

            {editMode === "crop" && (
              <p style={{ margin: "5px 0 0 0", fontSize: "11px", color: "#00dfd8", textAlign: "center", fontStyle: "italic" }}>
                👉 Drag the glowing cyan corner handle on the canvas to manually resize the cropped boundary region.
              </p>
            )}

          </div>
        ) : (
          <p style={{ textAlign: "center", color: "#555", fontStyle: "italic", margin: "5px 0" }}>Tap an asset layer inside the workspace to enable modifiers.</p>
        )}
      </div>
    </div>
  );
}
