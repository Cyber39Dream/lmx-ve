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

  // 1. Upload image -> create layer with positioning & transformation properties
  function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        // Calculate a reasonable starting size that fits the canvas
        const scale = Math.min(400 / img.width, 300 / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;

        const newLayer = {
          id: Date.now(),
          name: `Layer ${layers.length + 1}`,
          image: reader.result,
          visible: true,
          brightness: 100,
          contrast: 100,
          // Position & Size dimensions
          x: (800 - w) / 2, 
          y: (500 - h) / 2,
          width: w,
          height: h,
          // Cutout & Crop states
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

  // --- MOUSE DRAG & DROP LOGIC ---
  function getCanvasMousePos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // Scale mouse coordinates properly relative to canvas element boundaries
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handleMouseDown(e) {
    const mouse = getCanvasMousePos(e);
    
    // Scan layers backwards (top to bottom) to grab the topmost clicked layer
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
        return {
          ...l,
          x: mouse.x - dragStart.x,
          y: mouse.y - dragStart.y
        };
      }
      return l;
    }));
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  // --- EXPORT FUNCTION ---
  function downloadImage() {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    const finalName = exportName.trim() || "lumox-export";
    link.download = `${finalName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // --- RENDERING CORE CYCLE ---
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

        // 1. Position/Translate and Clip (Cutout)
        if (layer.isCircleCutout) {
          ctx.beginPath();
          const centerX = layer.x + layer.width / 2;
          const centerY = layer.y + layer.height / 2;
          const radius = Math.min(layer.width, layer.height) / 2;
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.clip();
        }

        // 2. Apply Filters
        ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%)`;
        
        // 3. Draw image using Crop parameters
        // Arguments: drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        ctx.drawImage(
          img,
          layer.cropX, layer.cropY, layer.cropW, layer.cropH, // Source crop definitions
          layer.x, layer.y, layer.width, layer.height         // Canvas target rendering dimensions
        );
        
        ctx.restore();
      });
    });
  }, [layers]);

  const currentLayerData = layers.find((l) => l.id === activeLayer);

  return (
    <div className="app" style={{ fontFamily: "sans-serif", padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* HEADER */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: "15px", marginBottom: "20px" }}>
        <div>
          <h1 style={{ margin: 0, color: "#222" }}>Lumox VE</h1>
          <p style={{ margin: "5px 0 0 0", color: "#666" }}>v0.4 Professional Canvas Engine</p>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <label htmlFor="filename-input" style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>File Name</label>
            <input
              id="filename-input"
              type="text"
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #ccc", width: "160px" }}
            />
          </div>
          <button onClick={downloadImage} disabled={layers.length === 0} style={{ padding: "10px 16px", backgroundColor: layers.length === 0 ? "#ccc" : "#0070f3", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", marginTop: "18px" }}>
            💾 Download Image
          </button>
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="toolbar" style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#f5f5f5", borderRadius: "6px" }}>
        <span style={{ marginRight: "10px", fontWeight: "bold" }}>Add Image Layer:</span>
        <input type="file" accept="image/*" onChange={handleUpload} />
      </div>

      {/* MAIN WORKSPACE */}
      <div className="workspace" style={{ display: "flex", gap: "20px" }}>
        
        {/* LAYERS MANAGER (LEFT) */}
        <div className="layers" style={{ width: "280px", border: "1px solid #ddd", borderRadius: "6px", padding: "15px", backgroundColor: "#fafafa" }}>
          <h3 style={{ marginTop: 0, borderBottom: "2px solid #ddd", paddingBottom: "8px" }}>Layers ({layers.length})</h3>
          {layers.length === 0 ? (
            <p style={{ color: "#888", fontStyle: "italic", fontSize: "14px" }}>No layers uploaded yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column-reverse", gap: "8px" }}>
              {layers.map((layer, index) => (
                <div
                  key={layer.id}
                  onClick={() => setActiveLayer(layer.id)}
                  style={{ padding: "12px", borderRadius: "4px", border: activeLayer === layer.id ? "2px solid #0070f3" : "1px solid #ccc", background: activeLayer === layer.id ? "#eef6ff" : "#fff", cursor: "pointer" }}
                >
                  <input
                    type="text"
                    value={layer.name}
                    onClick={(e) => e.stopPropagation()} 
                    onChange={(e) => renameLayer(layer.id, e.target.value)}
                    style={{ width: "90%", marginBottom: "8px", fontWeight: "bold", border: "none", background: "transparent", borderBottom: "1px dashed #aaa" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id); }}>{layer.visible ? "👁️" : "📁"}</button>
                      <button onClick={(e) => { e.stopPropagation(); moveLayer(index, 1); }}>⬆</button>
                      <button onClick={(e) => { e.stopPropagation(); moveLayer(index, -1); }}>⬇</button>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} style={{ color: "red", background: "none", border: "none", cursor: "pointer" }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CANVAS INTERACTIVE CONTAINER (CENTER) */}
        <div className="canvas-area" style={{ flexGrow: 1, display: "flex", justifyContent: "center" }}>
          <canvas 
            ref={canvasRef} 
            width={800} 
            height={500} 
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ border: "1px solid #333", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", cursor: isDragging ? "grabbing" : "grab", background: "repeating-conic-gradient(#fff 0% 25%, #eee 0% 50%) 50% / 20px 20px" }} 
          />
        </div>

        {/* CONTROLS PANEL (RIGHT) */}
        <div className="controls" style={{ width: "280px", border: "1px solid #ddd", borderRadius: "6px", padding: "15px", backgroundColor: "#fafafa" }}>
          <h3 style={{ marginTop: 0, borderBottom: "2px solid #ddd", paddingBottom: "8px" }}>Transformations</h3>
          
          {currentLayerData ? (
            <div>
              <p style={{ fontSize: "14px" }}>Editing: <strong>{currentLayerData.name}</strong></p>
              
              {/* CUTOUT SECTION */}
              <div style={{ marginBottom: "20px", borderBottom: "1px solid #ddd", paddingBottom: "15px" }}>
                <label style={{ fontWeight: "bold", fontSize: "14px" }}>Shape Cutout</label>
                <div style={{ marginTop: "8px" }}>
                  <button 
                    onClick={() => updateActiveLayerSetting("isCircleCutout", !currentLayerData.isCircleCutout)}
                    style={{ width: "100%", padding: "6px", backgroundColor: currentLayerData.isCircleCutout ? "#e6f4ea" : "#fff", border: currentLayerData.isCircleCutout ? "1px solid #137333" : "1px solid #ccc", color: currentLayerData.isCircleCutout ? "#137333" : "#333", borderRadius: "4px", cursor: "pointer" }}
                  >
                    {currentLayerData.isCircleCutout ? "🟢 Circle Mask On" : "⚪ Apply Circle Mask"}
                  </button>
                </div>
              </div>

              {/* CROPPING SLIDERS */}
              <div style={{ marginBottom: "20px", borderBottom: "1px solid #ddd", paddingBottom: "15px" }}>
                <label style={{ fontWeight: "bold", fontSize: "14px" }}>Crop Width Bounds</label>
                <input
                  type="range"
                  min="50"
                  max={currentLayerData.nativeWidth}
                  value={currentLayerData.cropW}
                  onChange={(e) => updateActiveLayerSetting("cropW", Number(e.target.value))}
                  style={{ width: "100%", marginTop: "5px" }}
                />
                <label style={{ fontWeight: "bold", fontSize: "14px", display: "block", marginTop: "10px" }}>Crop Height Bounds</label>
                <input
                  type="range"
                  min="50"
                  max={currentLayerData.nativeHeight}
                  value={currentLayerData.cropH}
                  onChange={(e) => updateActiveLayerSetting("cropH", Number(e.target.value))}
                  style={{ width: "100%", marginTop: "5px" }}
                />
              </div>

              {/* FILTERS */}
              <div style={{ marginBottom: "15px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                  <label>Brightness</label>
                  <span>{currentLayerData.brightness}%</span>
                </div>
                <input type="range" min="0" max="200" value={currentLayerData.brightness} onChange={(e) => updateActiveLayerSetting("brightness", Number(e.target.value))} style={{ width: "100%" }} />
              </div>

              <div style={{ marginBottom: "15px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                  <label>Contrast</label>
                  <span>{currentLayerData.contrast}%</span>
                </div>
                <input type="range" min="0" max="200" value={currentLayerData.contrast} onChange={(e) => updateActiveLayerSetting("contrast", Number(e.target.value))} style={{ width: "100%" }} />
              </div>
            </div>
          ) : (
            <p style={{ color: "#666", fontStyle: "italic", fontSize: "14px" }}>Select a layer to adjust properties.</p>
          )}
        </div>

      </div>
    </div>
  );
}
