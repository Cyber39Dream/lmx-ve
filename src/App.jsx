import { useRef, useState, useEffect } from "react";

export default function App() {
  const canvasRef = useRef(null);

  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(null);

  // Upload image -> create layer
  function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const newLayer = {
        id: Date.now(),
        image: reader.result,
        visible: true
      };

      setLayers((prev) => [...prev, newLayer]);
      setActiveLayer(newLayer.id);
    };

    reader.readAsDataURL(file);
  }

  // Toggle visibility
  function toggleLayer(id) {
    setLayers((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      )
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

  // Render canvas whenever layers change
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    layers.forEach((layer) => {
      if (!layer.visible) return;

      const img = new Image();
      img.src = layer.image;

      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
    });
  }, [layers]);

  return (
    <div className="app">
      <h1>Lumox VE</h1>
      <p>v0.2 Layers System</p>

      <input type="file" accept="image/*" onChange={handleUpload} />

      <div className="workspace">
        {/* LEFT: Layers panel */}
        <div className="layers">
          <h3>Layers</h3>

          {layers.map((layer, index) => (
            <div
              key={layer.id}
              className={`layer ${activeLayer === layer.id ? "active" : ""}`}
              onClick={() => setActiveLayer(layer.id)}
            >
              👁️
              <button onClick={() => toggleLayer(layer.id)}>Toggle</button>

              <button onClick={() => moveLayer(index, -1)}>⬆</button>
              <button onClick={() => moveLayer(index, 1)}>⬇</button>
            </div>
          ))}
        </div>

        {/* RIGHT: Canvas */}
        <div className="canvas-area">
          <canvas ref={canvasRef} width={800} height={500} />
        </div>
      </div>
    </div>
  );
}
