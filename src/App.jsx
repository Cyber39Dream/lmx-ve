import { useRef, useState, useEffect } from "react";

export default function App() {
  const canvasRef = useRef(null);

  // Core App States
  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(null);
  const [exportName, setExportName] = useState("lumox-export");
  
  // Interaction States
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Upload image -> create layer with positioning & transformation properties
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
          name: `Image Layer ${layers.length + 1}`,
          image: reader.result,
          visible: true,
          brightness: 100,
          contrast: 100,
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

        setLayers((prev) => [...prev, newLayer]);
        setActiveLayer(newLayer.id);
      };
    };
    reader.readAsDataURL(file);
  }

  // Layer stack interactions
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
  }

  function deleteLayer(id) {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (activeLayer === id) setActiveLayer(null);
  }

  function renameLayer(id, newName) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name: newName } : l)));
  }

  function updateActiveLayerSetting(setting, value) {
    setLayers((prev) =>
      prev.map((l) => (l.id === activeLayer ? { ...l, [setting]: value } : l))
    );
  }

  // Mouse Drag & Drop Logic
  function getCanvasMousePos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handleMouseDown(e) {
    const mouse = getCanvasMousePos(e);
    const clickedLayer = [...layers].reverse().find(l => {
      return l.visible && 
             mouse.x >= l.x && mouse.x <= l.x + l.width &&
             mouse.y >= l.y && mouse.y <= l.y + l.height;
    });

    if (clickedLayer) {
      setActiveLayer(clickedLayer.id);
      setIsDragging(true);
      setDragStart({ x: mouse.x - clickedLayer.x, y: mouse.y - clickedLayer.y });
    }
  }

  function handleMouseMove(e) {
    if (!isDragging || !activeLayer) return;
    const mouse = getCanvasMousePos(e);
    
    setLayers(prev => prev.map(l => {
      if (l.id === activeLayer) {
        return { ...l, x: mouse.x - dragStart.x, y: mouse.y - dragStart.y };
      }
      return l;
    }));
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  // Export Canvas
  function downloadImage() {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    const finalName = exportName.trim() || "lumox-export";
    link.download = `${finalName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // Render Engine Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const visibleLayers = layers.filter((l) => l.visible);

    const loadPromises = visibleLayers.map((layer) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = layer.image;
        img.onload = () => resolve({ img, layer });
      });
    });

    Promise.all(loadPromises).then((loadedLayers) => {
      loadedLayers.forEach(({ img, layer }) => {
        ctx.save();

        if (layer.isCircleCutout) {
          ctx.beginPath();
          const centerX = layer.x + layer.width / 2;
          const centerY = layer.y + layer.height / 2;
          const radius = Math.min(layer.width, layer.height) / 2;
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.clip();
        }

        ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%)`;
        ctx.drawImage(
          img,
          layer.cropX, layer.cropY, layer.cropW, layer.cropH,
          layer.x, layer.y, layer.width, layer.height
        );
        
        ctx.restore();
      });
    });
  }, [layers]);

  const currentLayerData = layers.find((l) => l.id === activeLayer);

  // Common UI Styles for cleaner inline JSX code mapping
  const panelHeaderStyle = { margin: "0 0 15px 0", fontSize: "14px", textTransform: "uppercase", letterSpacing: "1px", color: "#8a9ba8" };
  const controlBtnStyle = { background: "#2f3136", color: "#fff", border: "none", borderRadius: "4px", padding: "6px 10px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" };

  return (
    <div className="app" style={{ backgroundColor: "#121212", color: "#e1e1e1", fontFamily: "system-ui, -apple-system, sans-serif", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      
      {/* TOP NAVIGATION HEADER BAR */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1e1e1e", padding: "12px 24px", borderBottom: "1px solid #2d2d2d" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "800", background: "linear-gradient(45deg, #0070f3, #00dfd8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Lumox VE</h1>
          <span style={{ fontSize: "11px", backgroundColor: "#2d2d2d", padding: "3px 8px", borderRadius: "12px", color: "#a0a0a0" }}>v0.5 Pro Studio</span>
        </div>
        
        {/* EXPORT PANEL CONTROLS */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: "#2d2d2d", padding: "4px 8px", borderRadius: "6px" }}>
            <span style={{ fontSize: "11px", color: "#aaa" }}>Name:</span>
            <input
              type="text"
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              style={{ background: "transparent", border: "none", color: "#fff", fontSize: "13px", outline: "none", width: "140px", textAlign: "right" }}
            />
            <span style={{ fontSize: "12px", color: "#666" }}>.png</span>
          </div>
          <button 
            onClick={downloadImage} 
            disabled={layers.length === 0} 
            style={{ 
              padding: "8px 16px", 
              backgroundColor: layers.length === 0 ? "#2d2d2d" : "#0070f3", 
              color: layers.length === 0 ? "#666" : "#fff", 
              border: "none", 
              borderRadius: "6px", 
              cursor: layers.length === 0 ? "not-allowed" : "pointer", 
              fontWeight: "600",
              fontSize: "13px",
              boxShadow: layers.length === 0 ? "none" : "0 4px 12px rgba(0, 112, 243, 0.3)",
              transition: "all 0.2s"
            }}
          >
            💾 Export Image
          </button>
        </div>
      </header>

      {/* RE-ARCHITECTED INTERACTIVE WORKSPACE AREA */}
      <div className="workspace-layout" style={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
        
        {/* LEFT PANEL: LAYERS ARCHITECTURE CONTAINER */}
        <div className="side-panel layers-manager" style={{ width: "300px", backgroundColor: "#1e1e1e", borderRight: "1px solid #2d2d2d", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "20px", borderBottom: "1px solid #2d2d2d", display: "flex", justifyContent: "between", alignItems: "center" }}>
            <h3 style={{ ...panelHeaderStyle, margin: 0 }}>Layers Stack</h3>
          </div>

          {/* DYNAMIC FILE IMPORT ZONE */}
          <div style={{ padding: "15px" }}>
            <label style={{ display: "block", width: "100%", padding: "10px", boxSizing: "border-box", textAlign: "center", border: "2px dashed #3a3a3a", borderRadius: "8px", cursor: "pointer", color: "#aaa", fontSize: "13px", backgroundColor: "#151515" }}>
              ➕ Import New Image
              <input type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
            </label>
          </div>

          <div style={{ flexGrow: 1, overflowY: "auto", padding: "0 15px 15px 15px", display: "flex", flexDirection: "column-reverse", gap: "10px" }}>
            {layers.length === 0 ? (
              <p style={{ color: "#555", fontStyle: "italic", textAlign: "center", fontSize: "13px", marginTop: "20px" }}>No layers context detected.</p>
            ) : (
              layers.map((layer, index) => (
                <div
                  key={layer.id}
                  onClick={() => setActiveLayer(layer.id)}
                  style={{ 
                    padding: "12px", 
                    borderRadius: "8px", 
                    border: activeLayer === layer.id ? "1px solid #0070f3" : "1px solid #2d2d2d", 
                    background: activeLayer === layer.id ? "#1a2436" : "#151515", 
                    cursor: "pointer",
                    transition: "border 0.2s, background 0.2s"
                  }}
                >
                  <input
                    type="text"
                    value={layer.name}
                    onClick={(e) => e.stopPropagation()} 
                    onChange={(e) => renameLayer(layer.id, e.target.value)}
                    style={{ width: "100%", fontWeight: "600", fontSize: "13px", border: "none", background: "transparent", color: activeLayer === layer.id ? "#fff" : "#aaa", outline: "none", marginBottom: "10px" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button title="Toggle Visibility" onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id); }} style={controlBtnStyle}>
                        {layer.visible ? "👁️" : "📁"}
                      </button>
                      <button title="Move Up" onClick={(e) => { e.stopPropagation(); moveLayer(index, 1); }} style={controlBtnStyle}>⬆</button>
                      <button title="Move Down" onClick={(e) => { e.stopPropagation(); moveLayer(index, -1); }} style={controlBtnStyle}>⬇</button>
                    </div>
                    <button title="Delete Layer" onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} style={{ ...controlBtnStyle, color: "#ff4d4f", background: "rgba(255,77,79,0.1)" }}>🗑️</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* CENTER VIEWPORT: THE CANVAS EDITING BACKDROP CONTAINER */}
        <div className="canvas-viewport" style={{ flexGrow: 1, backgroundColor: "#0f0f0f", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
          <div style={{ padding: "8px", backgroundColor: "#1e1e1e", borderRadius: "12px", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}>
            <canvas 
              ref={canvasRef} 
              width={800} 
              height={500} 
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ 
                display: "block",
                borderRadius: "6px",
                cursor: isDragging ? "grabbing" : "grab", 
                background: "repeating-conic-gradient(#252525 0% 25%, #1e1e1e 0% 50%) 50% / 16px 16px" 
              }} 
            />
          </div>
        </div>

        {/* RIGHT PANEL: PROPERTY FILTER SLIDERS & TRANSFORMS */}
        <div className="side-panel property-inspector" style={{ width: "300px", backgroundColor: "#1e1e1e", borderLeft: "1px solid #2d2d2d", padding: "20px", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <h3 style={panelHeaderStyle}>Inspector</h3>
          
          {currentLayerData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              
              {/* SHAPE MASK CONFIG */}
              <div>
                <span style={{ fontSize: "12px", color: "#8a9ba8", fontWeight: "600", display: "block", marginBottom: "8px" }}>MASKING</span>
                <button 
                  onClick={() => updateActiveLayerSetting("isCircleCutout", !currentLayerData.isCircleCutout)}
                  style={{ 
                    width: "100%", 
                    padding: "10px", 
                    backgroundColor: currentLayerData.isCircleCutout ? "#1e3a2f" : "#252525", 
                    border: currentLayerData.isCircleCutout ? "1px solid #137333" : "1px solid #3a3a3a", 
                    color: currentLayerData.isCircleCutout ? "#4ade80" : "#ccc", 
                    borderRadius: "6px", 
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: "500"
                  }}
                >
                  {currentLayerData.isCircleCutout ? "🟢 Circle Cutout Active" : "⚪ Apply Circle Cutout"}
                </button>
              </div>

              {/* CROPPING GEOMETRY MODULE */}
              <div style={{ borderTop: "1px solid #2d2d2d", paddingTop: "15px" }}>
                <span style={{ fontSize: "12px", color: "#8a9ba8", fontWeight: "600", display: "block", marginBottom: "12px" }}>CROP DIMENSIONS</span>
                
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <label style={{ color: "#aaa" }}>Crop Width Bounds</label>
                    <span style={{ color: "#fff" }}>{currentLayerData.cropW}px</span>
                  </div>
                  <input type="range" min="50" max={currentLayerData.nativeWidth} value={currentLayerData.cropW} onChange={(e) => updateActiveLayerSetting("cropW", Number(e.target.value))} style={{ width: "100%" }} />
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <label style={{ color: "#aaa" }}>Crop Height Bounds</label>
                    <span style={{ color: "#fff" }}>{currentLayerData.cropH}px</span>
                  </div>
                  <input type="range" min="50" max={currentLayerData.nativeHeight} value={currentLayerData.cropH} onChange={(e) => updateActiveLayerSetting("cropH", Number(e.target.value))} style={{ width: "100%" }} />
                </div>
              </div>

              {/* ENHANCEMENT FILTERS MODULE */}
              <div style={{ borderTop: "1px solid #2d2d2d", paddingTop: "15px" }}>
                <span style={{ fontSize: "12px", color: "#8a9ba8", fontWeight: "600", display: "block", marginBottom: "12px" }}>FILTERS & ADJUSTMENTS</span>
                
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <label style={{ color: "#aaa" }}>Brightness</label>
                    <span style={{ color: "#fff" }}>{currentLayerData.brightness}%</span>
                  </div>
                  <input type="range" min="0" max="200" value={currentLayerData.brightness} onChange={(e) => updateActiveLayerSetting("brightness", Number(e.target.value))} style={{ width: "100%" }} />
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <label style={{ color: "#aaa" }}>Contrast</label>
                    <span style={{ color: "#fff" }}>{currentLayerData.contrast}%</span>
                  </div>
                  <input type="range" min="0" max="200" value={currentLayerData.contrast} onChange={(e) => updateActiveLayerSetting("contrast", Number(e.target.value))} style={{ width: "100%" }} />
                </div>
              </div>

            </div>
          ) : (
            <div style={{ textAlign: "center", marginTop: "40px", color: "#555", fontSize: "13px", fontStyle: "italic" }}>
              Select an image layer to inspect properties.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
