import { useState } from "react";

export default function App() {
  const [image, setImage] = useState(null);

  function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="app">
      <h1>Lumox VE</h1>
      <p>Visual Editor</p>

      <input type="file" accept="image/*" onChange={handleUpload} />

      <div className="canvas-area">
        {image ? (
          <img src={image} alt="uploaded" />
        ) : (
          <div className="placeholder">
            No image uploaded yet
          </div>
        )}
      </div>
    </div>
  );
}
