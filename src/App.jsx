import { useRef, useState, useEffect } from "react";

export default function App() {
  const canvasRef = useRef(null);

  // Custom Router State for WebIntoApp APK / Netlify
  const [currentPath, setCurrentPath] = useState(window.location.hash || "#/");

  // Core App States
  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(null);
  const [exportName, setExportName] = useState("lumox-export");
  
  // Tool Modes: "move", "crop", "cutout"
  const [editMode, setEditMode] = useState("move");
  // Cutout Sub-Modes: "erase" (remove background) or "restore" (uncutout / paint back)
  const [cutoutBrushMode, setCutoutBrushMode] = useState("erase");
  const [brushSize, setBrushSize] = useState(30);

  // Interaction States
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropBox, setCropBox] = useState(null); // { x, y, w, h } relative to canvas
  const [activeHandle, setActiveHandle] = useState(null);

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

        // Create an off-screen mask canvas for custom background erasure (Alpha channel tracking)
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = img.width;
        maskCanvas.height = img.height;
        const mCtx = maskCanvas.getContext("2d");
        // Fill completely white (100% visible initially)
        mCtx.fillStyle = "#ffffff";
        mCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

        const newLayer = {
          id: Date.now(),
          name: `Layer ${layers.length + 1}`,
          image: reader.result,
          visible: true,
          brightness: 100,
          contrast: 100,
          opacity: 100,
          x: (800 - w) / 2, 
          y: (500 - h) / 2,
          width: w,
          height: h,
          nativeWidth: img.width,
          nativeHeight: img.height,
          // Store mask as dataURL so it travels safely with state changes
          maskData: maskCanvas.toDataURL(),
          // Source image viewport coordinates for rendering modifications
          sX: 0,
          sY: 0,
          sW: img.width,
          sH: img.height
        };

        triggerHaptic(50);
        setLayers((prev) => [...prev, newLayer]);
        setActiveLayer(newLayer.id);
        navigateTo("#/editor");
      };
    };
    reader.readAsDataURL(file);
  }

  // Initialize crop coordinates based on current active layer bounding box
  useEffect(() => {
    const layer = layers.find(l => l.id === activeLayer);
    if (editMode === "crop" && layer) {
      setCropBox({ x: layer.x, y: layer.y, w: layer.width, h: layer.height });
    } else {
      setCropBox(null);
    }
  }, [editMode, activeLayer]);

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

  // --- EXECUTE ACTUAL HANDOUT CROPPER ---
  function applyCrop() {
    if (!cropBox || !activeLayer) return;
    triggerHaptic(60);

    setLayers(prev => prev.map(l => {
      if (l.id === activeLayer) {
        // Calculate percentages of visual crop to translate to original image resolution pixels
        const scaleX = l.nativeWidth / l.width;
        const scaleY = l.nativeHeight / l.height;

        const newSX = l.sX + (cropBox.x - l.x) * scaleX;
        const newSY = l.sY + (cropBox.y - l.y) * scaleY;
        const newSW = cropBox.w * scaleX;
        const newSH = cropBox.h * scaleY;

        return {
          ...l,
          x: cropBox.x,
          y: cropBox.y,
          width: cropBox.w,
          height: cropBox.h,
          sX: Math.max(0, newSX),
          sY: Math.max(0, newSY),
          sW: Math.min(l.nativeWidth, newSW),
          sH: Math.min(l.nativeHeight, newSH)
        };
      }
      return l;
    }));
    setEditMode("move");
  }

  // --- MANUAL BACKGROUND REMOVAL DRAWING ENGINE ---
  function drawCutoutMask(pos) {
    const layer = layers.find(l => l.id === activeLayer);
    if (!layer) return;

    // Convert canvas coordinates to the inner pixel spaces of the native asset image
    const scaleX = layer.nativeWidth / layer.width;
    const scaleY = layer.nativeHeight / layer.height;
    
    const imgX = (pos.x - layer.x) * scaleX;
    const imgY = (pos.y - layer.y) * scaleY;

    // Reconstruct temporary mask canvas environment
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = layer.nativeWidth;
    tempCanvas.height = layer.nativeHeight;
    const tempCtx = tempCanvas.getContext("2d");

    const maskImg = new Image();
    maskImg.src = layer.maskData;
    maskImg.onload = () => {
      tempCtx.drawImage(maskImg, 0, 0);

      // Erase background layer or uncutout (restore) background pixels
      tempCtx.save();
      tempCtx.beginPath();
      tempCtx.arc(imgX, imgY, brushSize * scaleX, 0, Math.PI * 2);
      
      if (cutoutBrushMode === "erase") {
        // Turn drawn areas transparent black on mask canvas
        tempCtx.globalCompositeOperation = "destination-out";
        tempCtx.fill();
      } else {
        // Restore: Paint full white visibility channel back on mask canvas
        tempCtx.globalCompositeOperation = "source-over";
        tempCtx.fillStyle = "#ffffff";
        tempCtx.fill();
      }
      tempCtx.restore();

      // Push updated alpha mask tracking parameters into active data array state
      setLayers(prev => prev.map(l => l.id === activeLayer ? { ...l, maskData: tempCanvas.toDataURL() } : l));
    };
  }

  // Reset the cutout entirely (Uncutout All)
  function clearCutout() {
    const layer = layers.find(l => l.id === activeLayer);
    if (!layer) return;
    triggerHaptic(40);

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = layer.nativeWidth;
    tempCanvas.height = layer.nativeHeight;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.fillStyle = "#ffffff";
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    updateActiveLayerSetting("maskData", tempCanvas.toDataURL());
  }

  function handleStart(e) {
    const pos = getCanvasInputPos(e);
    const layer = layers.find(l => l.id === activeLayer);

    // Crop Corner Intercept checks
    if (editMode === "crop" && cropBox) {
      const handleSize = 25;
      if (Math.abs(pos.x - (cropBox.x + cropBox.w)) < handleSize && Math.abs(pos.y - (cropBox.y + cropBox.h)) < handleSize) {
        setActiveHandle("bottom-right");
        setIsDragging(true);
        return;
      }
    }

    // Interactive Manual Background cutout execution check
    if (editMode === "cutout") {
      setIsDragging(true);
      drawCutoutMask(pos);
      return;
    }

    // Normal moving logic detection
    const clickedLayer = [...layers].reverse().find(l => {
      return l.visible && pos.x >= l.x && pos.x <= l.x + l.width && pos.y >= l.y && pos.y <= l.y + l.height;
    });

    if (clickedLayer) {
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

    if (editMode === "cutout") {
      drawCutoutMask(pos);
      return;
    }

    if (editMode === "crop" && activeHandle === "bottom-right" && cropBox) {
      setCropBox(prev => ({
        ...prev,
        w: Math.max(30, pos.x - prev.x),
        h: Math.max(30, pos.y - prev.y)
      }));
      return;
    }

    if (editMode === "move") {
      setLayers(prev => prev.map(l => l.id === activeLayer ? { ...l, x: pos.x - dragStart.x, y: pos.y - dragStart.y } : l));
    }
  }

  function handleEnd() {
    setIsDragging(false);
    setActiveHandle(null);
  }

  // Draw Engine loop mapping parameters on active Canvas elements
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const loadPromises = layers.filter(l => l.visible).map((layer) => {
      return new Promise((resolve) => {
        const img = new Image();
        const mask = new Image();
        let loadedCount = 0;

        const checkLoad = () => {
          loadedCount++;
          if (loadedCount === 2) resolve({ img, mask, layer });
        };

        img.src = layer.image;
        mask.src = layer.maskData;
        img.onload = checkLoad;
        mask.onload = checkLoad;
      });
    });

    Promise.all(loadPromises).then((loadedLayers) => {
      loadedLayers.forEach(({ img, mask, layer }) => {
        ctx.save();
        ctx.globalAlpha = layer.opacity / 100;

        // Render standard filters
        ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%)`;

        // 1. Create masked background cut out via offscreen canvas rendering
        const renderCanvas = document.createElement("canvas");
        renderCanvas.width = layer.nativeWidth;
        renderCanvas.height = layer.nativeHeight;
        const rCtx = renderCanvas.getContext("2d");

        // Draw original raw photo asset texture
        rCtx.drawImage(img, 0, 0);
        // Crop transparent overlay mask
        rCtx.globalCompositeOperation = "destination-in";
        rCtx.drawImage(mask, 0, 0);

        // 2. Output final processed texture safely mapped inside active workspace coordinates
        ctx.drawImage(
          renderCanvas,
          layer.sX, layer.sY, layer.sW, layer.sH,
          layer.x, layer.y, layer.width, layer.height
        );

        ctx.restore();
      });

      // Overlay separate visual cropping outline helper widgets over target graphics area
      if (editMode === "crop" && cropBox) {
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#0070f3";
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
        
        // Grab Handle square point
        ctx.fillStyle = "#00dfd8";
        ctx.fillRect(cropBox.x + cropBox.w - 10, cropBox.y + cropBox.h - 10, 20, 20);
        ctx.restore();
      }
    });
  }, [layers, currentPath, editMode, cropBox]);

  function downloadImage() {
    triggerHaptic(80);
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = `${exportName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  const currentLayerData = layers.find((l) => l.id === activeLayer);

  // --- VIEWS CONTROLLER ---
  if (currentPath === "#/" || currentPath === "") {
    return (
      <div style={{ backgroundColor: "#121212", color: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif", textAlign: "center", padding: "20px" }}>
        <h1 style={{ fontSize: "42px", margin: "0", background: "linear-gradient(45deg, #0070f3, #00dfd8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontWeight: "900" }}>Lumox VE</h1>
        <p style={{ color: "#666", marginBottom: "30px" }}>Manual Background Remover & Advanced Image Cropper</p>
        <button onClick={() => navigateTo("#/upload-image")} style={{ padding: "12px 30px", backgroundColor: "#0070f3", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold" }}>Start Workspace</button>
      </div>
    );
  }

  if (currentPath === "#/upload-image") {
    return (
      <div style={{ backgroundColor: "#121212", color: "#fff", minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif" }}>
        <div style={{ backgroundColor: "#1e1e1e", padding: "30px", borderRadius: "12px", border: "1px solid #2d2d2d", textAlign: "center", width: "90%", maxWidth: "360px" }}>
          <h3 style={{ margin: "0 0 10px 0" }}>Import Base Image</h3>
          <label style={{ display: "block", padding: "30px 10px", border: "2px dashed #0070f3", borderRadius: "8px", cursor: "pointer", color: "#0070f3", fontWeight: "bold", backgroundColor: "#151515" }}>
            Select File Asset
            <input type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#121212", color: "#e1e1e1", fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1e1e1e", padding: "10px", borderBottom: "1px solid #2d2d2d" }}>
        <span style={{ fontWeight: "bold", background: "linear-gradient(45deg, #0070f3, #00dfd8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Lumox Studio</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <input type="text" value={exportName} onChange={(e) => setExportName(e.target.value)} style={{ background: "#2d2d2d", border: "none", color: "#fff", padding: "4px 8px", borderRadius: "4px", width: "100px", fontSize: "12px" }} />
          <button onClick={downloadImage} style={{ background: "#0070f3", color: "#fff", border: "none", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" }}>Save</button>
        </div>
      </header>

      {/* WORKSPACE PREVIEW FRAME */}
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

      {/* DYNAMIC OPERATION OPTIONS LOWER PANEL FOOTER */}
      <div style={{ backgroundColor: "#1e1e1e", borderTop: "1px solid #2d2d2d", padding: "12px" }}>
        
        {/* SELECT CONTROL APPLICATION MODES */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => setEditMode("move")} style={{ padding: "8px 12px", borderRadius: "4px", border: "none", fontSize: "11px", fontWeight: "bold", backgroundColor: editMode === "move" ? "#0070f3" : "#2d2d2d", color: "#fff" }}>
            🖐️ Move Layer
          </button>
          <button onClick={() => setEditMode("crop")} style={{ padding: "8px 12px", borderRadius: "4px", border: "none", fontSize: "11px", fontWeight: "bold", backgroundColor: editMode === "crop" ? "#0070f3" : "#2d2d2d", color: "#fff" }}>
            📐 Crop Tool
          </button>
          <button onClick={() => setEditMode("cutout")} style={{ padding: "8px 12px", borderRadius: "4px", border: "none", fontSize: "11px", fontWeight: "bold", backgroundColor: editMode === "cutout" ? "#0070f3" : "#2d2d2d", color: "#fff" }}>
            ✂️ Cutout BG (Draw)
          </button>
        </div>

        {/* SUBMODIFIERS AND UTILITY ACTIONS */}
        {currentLayerData ? (
          <div style={{ maxWidth: "500px", margin: "0 auto", fontSize: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            
            {/* CROP EXECUTOR MODE UI */}
            {editMode === "crop" && (
              <div style={{ backgroundColor: "#151515", padding: "10px", borderRadius: "6px", textAlign: "center" }}>
                <p style={{ margin: "0 0 8px 0", color: "#aaa" }}>Drag the cyan bottom-right corner anchor on the canvas frame box.</p>
                <button onClick={applyCrop} style={{ backgroundColor: "#0070f3", color: "#fff", border: "none", padding: "6px 16px", borderRadius: "4px", fontWeight: "bold" }}>
                  Confirm & Cut Crop Clear
                </button>
              </div>
            )}

            {/* CUTOUT REMOVER BACKGROUND DRAW MODE UI */}
            {editMode === "cutout" && (
              <div style={{ backgroundColor: "#151515", padding: "10px", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => setCutoutBrushMode("erase")} style={{ flex: 1, padding: "6px", borderRadius: "4px", border: "none", backgroundColor: cutoutBrushMode === "erase" ? "#ff4d4f" : "#2d2d2d", color: "#fff", fontWeight: "bold" }}>
                    🔴 Erase Background
                  </button>
                  <button onClick={() => setCutoutBrushMode("restore")} style={{ flex: 1, padding: "6px", borderRadius: "4px", border: "none", backgroundColor: cutoutBrushMode === "restore" ? "#137333" : "#2d2d2d", color: "#fff", fontWeight: "bold" }}>
                    🟢 Paint Back (Uncutout)
                  </button>
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <label style={{ color: "#aaa" }}>Brush Size ({brushSize}px)</label>
                  <input type="range" min="5" max="80" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ width: "60%" }} />
                </div>

                <button onClick={clearCutout} style={{ background: "none", border: "none", color: "#ff4d4f", fontSize: "11px", cursor: "pointer", textDecoration: "underline", alignSelf: "center" }}>
                  Reset Layer (Clear All Cutouts)
                </button>
              </div>
            )}

            {/* BASIC LAYER STATS */}
            <div style={{ display: "flex", justifyContent: "space-between", color: "#8a9ba8", fontSize: "11px", marginTop: "4px" }}>
              <span>Target Layer: <b>{currentLayerData.name}</b></span>
              <label style={{ display: "inline-block" }}>
                📁 Add Layer Over
                <input type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
              </label>
            </div>

          </div>
        ) : (
          <p style={{ textAlign: "center", color: "#555", fontStyle: "italic" }}>Tap the image workspace layer to unlock editing modules.</p>
        )}
      </div>
    </div>
  );
}
