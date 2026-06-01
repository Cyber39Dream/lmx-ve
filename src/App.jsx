import { useRef, useState, useEffect } from "react";

export default function App() {
  const canvasRef = useRef(null);

  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(null);

  // Upload image -> create layer with individual adjustment states
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

  // Toggle visibility
  function toggleLayer(id) {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  }

  // Move layer up/down
  function moveLayer(index, direction) {
    setLayers((prev) => {
      const arr = [...prev];
      const newIndex = index + direction;

      if (newIndex < 0 || newIndex >= arr.length) return arr;

      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  }

  // Delete a layer
  function deleteLayer(id) {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (activeLayer === id) {
      setActiveLayer(null);
    }
  }

  // Rename a layer
  function renameLayer(id, newName) {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, name: newName } : l))
    );
  }

  // Update slider settings for the active layer
  function updateActiveLayerSetting(setting, value) {
    setLayers((prev) =>
      prev.map((l) => (l.id === activeLayer ? { ...l, [setting]: value } : l))
    );
  }

  // Export compiled canvas layers as a PNG
  function downloadImage() {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = "lumox-export.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // Render canvas whenever layers or their adjustment properties change
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const visibleLayers = layers.filter((l) => l.visible);

    // Create parallel loading promises
    const loadPromises = visibleLayers.map((layer) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = layer.image;
        img.onload = () => resolve({ img, layer });
      });
    });

    Promise.all(loadPromises).then((loadedLayers) => {
      loadedLayers.forEach(({ img, layer }) => {
        ctx.save(); // Save default canvas state

        // Apply specific CSS filters onto the canvas context for this specific layer
        ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%)`;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        ctx.restore(); // Restore context back to default for the next layer
      });
    });
  }, [layers]);

  // Find the current active layer data to control sliders
  const currentLayerData = layers.find((l) => l.id === activeLayer);

  return (
    <div className="app">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>Lumox VE</h1>
          <p>v0.3 Multi-Feature Layer Editor</p>
        </div>
        <button onClick={downloadImage} disabled={layers.length === 0} className="download-btn">
          💾 Download Image
        </button>
      </header>

      <div className="toolbar" style={{ margin: "15px 0" }}>
        <input type="file" accept="image/*" onChange={handleUpload} />
      </div>

      <div className="workspace" style={{ display: "flex", gap: "20px" }}>
        {/* LEFT: Layers panel */}
        <div className="layers" style={{ width: "250px", borderRight: "1px solid #ccc", paddingRight: "15px" }}>
          <h3>Layers</h3>

          {layers.map((layer, index) => (
            <div
              key={layer.id}
              className={`layer ${activeLayer === layer.id ? "active" : ""}`}
              onClick={() => setActiveLayer(layer.id)}
              style={{
                padding: "10px",
                marginBottom: "5px",
                border: "1px solid #aaa",
                background: activeLayer === layer.id ? "#e0e0e0" : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="text"
                value={layer.name}
                onClick={(e) => e.stopPropagation()} // Stop text selection from activating layer
                onChange={(e) => renameLayer(layer.id, e.target.value)}
                style={{ width: "100px", marginBottom: "5px", fontWeight: "bold" }}
              />

              <div style={{ display: "flex", gap: "5px" }}>
                <button onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id); }}>
                  {layer.visible ? "👁️" : "📁"}
                </button>
                <button onClick={(e) => { e.stopPropagation(); moveLayer(index, -1); }}>⬆</button>
                <button onClick={(e) => { e.stopPropagation(); moveLayer(index, 1); }}>⬇</button>
                <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} style={{ color: "red" }}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* CENTER: Canvas */}
        <div className="canvas-area">
          <canvas ref={canvasRef} width={800} height={500} style={{ border: "1px solid #000", background: "#f0f0f0" }} />
        </div>

        {/* RIGHT: Fine Adjustments controls */}
        <div className="controls" style={{ width: "200px", paddingLeft: "15px", borderLeft: "1px solid #ccc" }}>
          <h3>Adjustments</h3>
          {currentLayerData ? (
            <div>
              <p>Editing: <strong>{currentLayerData.name}</strong></p>
              
              <div style={{ marginBottom: "15px" }}>
                <label>Brightness ({currentLayerData.brightness}%)</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={currentLayerData.brightness}
                  onChange={(e) => updateActiveLayerSetting("brightness", Number(e.target.value))}
                />
              </div>

              <div style={{ marginBottom: "15px" }}>
                <label>Contrast ({currentLayerData.contrast}%)</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={currentLayerData.contrast}
                  onChange={(e) => updateActiveLayerSetting("contrast", Number(e.target.value))}
                />
              </div>
            </div>
          ) : (
            <p style={{ color: "#666", fontStyle: "italic" }}>Select a layer to adjust properties</p>
          )}
        </div>
      </div>
    </div>
  );
}
