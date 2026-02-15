# Enterprise Graphics Studio Dependencies

Add these dependencies to your package.json:

```json
{
  "dependencies": {
    "fabric": "^5.3.0",
    "konva": "^9.3.0",
    "react-konva": "^18.2.10",
    "@remotion/player": "^4.0.0",
    "@remotion/renderer": "^4.0.0",
    "lottie-web": "^5.12.2",
    "react-lottie": "^1.2.3",
    "three": "^0.160.0",
    "@react-three/fiber": "^8.15.0",
    "@react-three/drei": "^9.92.0",
    "yjs": "^13.6.0",
    "y-websocket": "^1.5.0",
    "file-saver": "^2.0.5",
    "jszip": "^3.10.1",
    "gifshot": "^0.4.5",
    "html2canvas": "^1.4.1",
    "jspdf": "^2.5.1",
    "opentype.js": "^1.3.4",
    "paper": "^0.12.17",
    "chroma-js": "^2.4.2",
    "gsap": "^3.12.0",
    "animejs": "^3.2.1",
    "p5": "^1.9.0",
    "ml5": "^0.12.2",
    "roughjs": "^4.5.2",
    "zdog": "^1.1.3",
    "matter-js": "^0.19.0",
    "pixi.js": "^7.3.0"
  }
}
```

## Installation

```bash
cd apps/web
npm install fabric konva react-konva lottie-web react-lottie three @react-three/fiber @react-three/drei yjs y-websocket file-saver jszip html2canvas opentype.js chroma-js gsap animejs
```

## Features Enabled

### Core Graphics Libraries
- **Fabric.js**: Advanced canvas manipulation, object model, serialization
- **Konva.js**: High-performance 2D canvas with animations and filters
- **Three.js**: 3D graphics and effects

### Animation & Effects
- **GSAP**: Professional-grade animation library
- **Anime.js**: Lightweight animation engine
- **Lottie**: After Effects animations support

### Advanced Features
- **Yjs**: Real-time collaboration (CRDT)
- **OpenType.js**: Advanced typography control
- **Chroma.js**: Advanced color manipulation
- **Matter.js**: Physics engine for dynamic graphics
- **Pixi.js**: WebGL renderer for GPU acceleration

### Export & Processing
- **html2canvas**: Canvas to image conversion
- **jsPDF**: PDF generation
- **JSZip**: Batch export compression
- **File Saver**: Client-side file downloads

## Backend Requirements

For MXF export, ensure FFmpeg is installed:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

## Features Implemented

1. **Professional Templates**
   - News lower thirds with animations
   - Breaking news alerts
   - Sports scoreboards
   - Weather graphics
   - Election results

2. **Advanced Animation System**
   - In/Out/Loop animations
   - Easing functions
   - Keyframe timeline
   - Real-time preview

3. **Enterprise Tools**
   - Multi-layer management
   - History/Undo system
   - Object alignment tools
   - Smart guides
   - Keyboard shortcuts

4. **Export Options**
   - MXF with DNxHD/ProRes
   - MOV/MP4 with H.264/HEVC
   - Image sequences (PNG/TIFF/DPX/EXR)
   - GXF for Grass Valley systems

5. **Data Integration**
   - Live data binding
   - RSS/CSV/API connections
   - WebSocket real-time updates
   - Template variables

6. **Collaboration Features**
   - Real-time multi-user editing
   - Version control
   - Comments and annotations
   - Project sharing

7. **Performance Optimizations**
   - GPU acceleration
   - Object caching
   - Lazy loading
   - Web Workers for heavy processing
