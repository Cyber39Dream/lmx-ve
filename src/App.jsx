import { useRef, useState, useEffect } from "react";

export default function App() {
  const canvasRef = useRef(null);

  // Core App States
  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(null);
  const [exportName, setExportName] = useState("lumox-export");

  // 1. Upload image -> create layer with individual adjustment states
  function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const newLayer = {
        id: Date.now(),
        name: `Layer ${layers.length + 1}`,
        image: reader.result,
        visible: true,
        brightness: 100, // percentage base
        contrast: 100,   // percentage base
      };

      setLayers((prev) => [...prev, newLayer]);
      setActiveLayer(newLayer.id);
    };

    reader.readAsDataURL(file);
  }

  // 2. Toggle layer visibility
  function toggleLayer(id) {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  }

  // 3. Move layer up/down in the layer stack
  function moveLayer(index, direction) {
    setLayers((prev) => {
      const arr = [...prev];
      const newIndex = index + direction;

      if (newIndex < 0 || newIndex >= arr.length) return arr;

      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  }

  // 4. Delete a layer entirely
  function deleteLayer(id) {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (activeLayer === id) {
      setActiveLayer(null);
    }
  }

  // 5. Rename a layer dynamically
  function renameLayer(id, newName) {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, name: newName } : l))
    );
  }

  // 6. Update slider settings for the active layer
  function updateActiveLayerSetting(setting, value) {
    setLayers((prev) =>
      prev.map((l) => (l.id === activeLayer ? { ...l, [setting]: value } : l))
    );
  }

  // 7. Export compiled canvas layers as a PNG file
  function downloadImage() {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    
    // Safety guard fallback if name input is left completely empty
    const finalName = exportName.trim() || "lumox-export";
    link.download = `${finalName}.png`;
    
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // 8. Render loop: Fires whenever layers array or adjustments modify
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Clear canvas canvas frame for fresh draw cycle
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const visibleLayers = layers.filter((l) => l.visible);

    // Create parallel loading promises to stop rendering race conditions
    const loadPromises = visibleLayers.map((layer) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = layer.image;
        img.onload = () => resolve({ img, layer });
      });
    });

    Promise.all(loadPromises).then((loadedLayers) => {
      loadedLayers.forEach(({ img, layer }) => {
        ctx.save(); // Isolate context modifications

        // Apply filters only to this specific drawn layer index
        ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%)`;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        ctx.restore(); // Revert back to default context settings
      });
    });
  }, [layers]);

  // Find the operational object data for currently chosen active layer
  const currentLayerData = layers.find((l) => l.id === activeLayer);

  return (
    <div className="app" style={{ fontFamily: "sans-serif", padding: "20px", maxWidth: "1300px", margin: "0 auto" }}>
      {/* HEADER SECTION */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: "15px", marginBottom: "20px" }}>
        <div>
          <h1 style={{ margin: 0, color: "#222" }}>Lumox VE</h1>
          <p style={{ margin: "5px 0 0 0", color: "#666" }}>v0.3.5 Multi-Feature Layer Editor</p>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <label htmlFor="filename-input" style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>File Name</label>
            <input
              id="filename-input"
              type="text"
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              placeholder="Enter file name..."
              style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #ccc", width: "160px" }}
            />
          </div>
          
          <button 
            onClick={downloadImage} 
            disabled={layers.length === 0} 
            style={{ 
              padding: "10px 16px", 
              alignSelf: "flex-end", 
              backgroundColor: layers.length === 0 ? "#ccc" : "#0070f3", 
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: layers.length === 0 ? "not-allowed" : "pointer",
              fontWeight: "bold"
            }}
          >
            💾 Download Image
          </button>
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="toolbar" style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#f5f5f5", borderRadius: "6px" }}>
        <span style={{ marginRight: "10px", fontWeight: "bold" }}>Add Image Layer:</span>
        <input type="file" accept="image/*" onChange={handleUpload} />
      </div>

      {/* CORE WORKSPACE AREA */}
      <div className="workspace" style={{ display: "flex", gap: "20px" }}>
        
        {/* LAYERS MANAGER PANEL (LEFT) */}
        <div className="layers" style={{ width: "280px", border: "1px solid #ddd", borderRadius: "6px", padding: "15px", backgroundColor: "#fafafa" }}>
          <h3 style={{ marginTop: 0, borderBottom: "2px solid #ddd", paddingBottom: "8px" }}>Layers ({layers.length})</h3>

          {layers.length === 0 ? (
            <p style={{ color: "#888", fontStyle: "italic", fontSize: "14px" }}>No layers uploaded yet.</p>
          ) : (
            // Flex column layout, rendering bottom-most layer last
            <div style={{ display: "flex", flexDirection: "column-reverse", gap: "8px" }}>
              {layers.map((layer, index) => (
                <div
                  key={layer.id}
                  onClick={() => setActiveLayer(layer.id)}
                  style={{
                    padding: "12px",
                    borderRadius: "4px",
                    border: activeLayer === layer.id ? "2px solid #0070f3" : "1px solid #ccc",
                    background: activeLayer === layer.id ? "#eef6ff" : "#fff",
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                  }}
                >
                  <input
                    type="text"
                    value={layer.name}
                    onClick={(e) => e.stopPropagation()} 
                    onChange={(e) => renameLayer(layer.id, e.target.value)}
                    style={{ 
                      width: "90%", 
                      marginBottom: "8px", 
                      fontWeight: "bold", 
                      border: "none", 
                      background: "transparent",
                      borderBottom: "1px dashed #aaa"
                    }}
                  />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button title="Toggle Visibility" onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id); }} style={{ padding: "4px 8px" }}>
                        {layer.visible ? "👁️" : "📁"}
                      </button>
                      <button title="Move Up" onClick={(e) => { e.stopPropagation(); moveLayer(index, 1); }} style={{ padding: "4px 8px" }}>⬆</button>
                      <button title="Move Down" onClick={(e) => { e.stopPropagation(); moveLayer(index, -1); }} style={{ padding: "4px 8px" }}>⬇</button>
                    </div>
                    <button title="Delete Layer" onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} style={{ color: "red", padding: "4px 8px", background: "none", border: "none", cursor: "pointer" }}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CANVAS MONITOR SCREEN (CENTER) */}
        <div className="canvas-area" style={{ flexGrow: 1, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
          <canvas 
            ref={canvasRef} 
            width={800} 
            height={500} 
            style={{ 
              border: "1px solid #333", 
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              background: "repeating-conic-gradient(#fff 0% 25%, #eee 0% 50%) 50% / 20px 20px" /* Checkerboard background pattern */
            }} 
          />
        </div>

        {/* PROPERTY SLIDERS PANEL (RIGHT) */}
        <div className="controls" style={{ width: "240px", border: "1px solid #ddd", borderRadius: "6px", padding: "15px", backgroundColor: "#fafafa" }}>
          <h3 style={{ marginTop: 0, borderBottom: "2px solid #ddd", paddingBottom: "8px" }}>Adjustments</h3>
          
          {currentLayerData ? (
            <div>
              <p style={{ fontSize: "14px" }}>Editing: <strong>{currentLayerData.name}</strong></p>
              
              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "5px" }}>
                  <label>Brightness</label>
                  <span>{currentLayerData.brightness}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={currentLayerData.brightness}
                  onChange={(e) => updateActiveLayerSetting("brightness", Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "5px" }}>
                  <label>Contrast</label>
                  <span>{currentLayerData.contrast}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={currentLayerData.contrast}
                  onChange={(e) => updateActiveLayerSetting("contrast", Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          ) : (
            <p style={{ color: "#666", fontStyle: "italic", fontSize: "14px" }}>Select a layer from the panel to adjust properties.</p>
          )}
        </div>

      </div>
    </div>
  );
}
