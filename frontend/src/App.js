import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, Download, Type, ImagePlus, Trash2, ChevronLeft, ChevronRight, Plus, GripVertical, Maximize2 } from 'lucide-react';
import heic2any from 'heic2any';

function App() {
  const [pages, setPages] = useState([{ id: 1, images: [], texts: [] }]);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Get current page data with useMemo to prevent unnecessary re-renders
  const images = useMemo(() => pages[currentPage]?.images || [], [pages, currentPage]);
  const texts = useMemo(() => pages[currentPage]?.texts || [], [pages, currentPage]);

  // Prevent page scroll when resizing
  useEffect(() => {
    if (isResizing) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isResizing]);
  
  const setImages = (updateFn) => {
    setPages(prev => {
      const newPages = [...prev];
      newPages[currentPage] = {
        ...newPages[currentPage],
        images: typeof updateFn === 'function' ? updateFn(newPages[currentPage].images) : updateFn
      };
      return newPages;
    });
  };
  
  const setTexts = (updateFn) => {
    setPages(prev => {
      const newPages = [...prev];
      newPages[currentPage] = {
        ...newPages[currentPage],
        texts: typeof updateFn === 'function' ? updateFn(newPages[currentPage].texts) : updateFn
      };
      return newPages;
    });
  };

  useEffect(() => {
    console.log('Images state updated:', images.length, 'images');
    console.log('Images:', images);
  }, [images]);

  useEffect(() => {
    console.log('Texts state updated:', texts.length, 'texts');
  }, [texts]);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    console.log('Files selected:', files.length);
    
    for (const file of files) {
      try {
        let fileToProcess = file;
        
        // Check if it's a HEIC file and convert it
        if (file.type === 'image/heic' || file.type === 'image/heif' || 
            file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
          console.log('Converting HEIC file:', file.name);
          const convertedBlob = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.9
          });
          fileToProcess = new File([convertedBlob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
          console.log('HEIC converted to JPEG');
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target.result;
          console.log('Image loaded, data URL length:', dataUrl.length);
          console.log('Data URL starts with:', dataUrl.substring(0, 50));
          
          setImages(prev => {
            // Position near top-center of canvas
            const canvasWidth = 794; // A4 width
            const imageWidth = 400;
            const centerX = (canvasWidth - imageWidth) / 2; // Center horizontally
            const topY = 50; // Close to top
            
            // Offset subsequent images by 30px diagonally
            const offset = prev.length * 30;
            
            const newImage = {
              id: Date.now() + Math.random(),
              src: dataUrl,
              x: centerX + offset,
              y: topY + offset,
              width: 400,
              height: 400,
              rotation: 0,
            };
            console.log('Adding image at:', centerX + offset, topY + offset);
            return [...prev, newImage];
          });
        };
        reader.onerror = (error) => {
          console.error('FileReader error:', error);
        };
        reader.readAsDataURL(fileToProcess);
      } catch (error) {
        console.error('Error processing file:', file.name, error);
        alert(`Failed to process ${file.name}. ${error.message}`);
      }
    }
  };

  const addText = () => {
    setTexts(prev => [...prev, {
      id: Date.now() + Math.random(),
      content: 'Double click to edit',
      x: 100,
      y: 100,
      fontSize: 24,
      color: '#000000',
    }]);
  };

  const handleMouseDown = (e, item, type) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedItem({ ...item, type });
    setIsDragging(true);
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Handle both mouse and touch events
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    
    setDragOffset({
      x: clientX - rect.left - item.x,
      y: clientY - rect.top - item.y,
    });
    
    // Bring selected image to front
    if (type === 'image') {
      setImages(prev => {
        const otherImages = prev.filter(img => img.id !== item.id);
        const selectedImage = prev.find(img => img.id === item.id);
        return [...otherImages, selectedImage];
      });
    }
  };

  const handleResizeStart = (e, item, handle) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedItem({ ...item, type: 'image' });
    setIsResizing(true);
    setResizeHandle(handle);
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Handle both mouse and touch events
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    
    setResizeStart({
      x: clientX - rect.left,
      y: clientY - rect.top,
      width: item.width,
      height: item.height,
      startX: item.x,
      startY: item.y,
    });
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Handle both mouse and touch events
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    if (isDragging && selectedItem && !isResizing) {
      const newX = mouseX - dragOffset.x;
      const newY = mouseY - dragOffset.y;

      if (selectedItem.type === 'image') {
        setImages(prev => prev.map(img => 
          img.id === selectedItem.id ? { ...img, x: newX, y: newY } : img
        ));
      } else {
        setTexts(prev => prev.map(txt => 
          txt.id === selectedItem.id ? { ...txt, x: newX, y: newY } : txt
        ));
      }
    } else if (isResizing && selectedItem) {
      const deltaX = mouseX - resizeStart.x;
      const deltaY = mouseY - resizeStart.y;

      setImages(prev => prev.map(img => {
        if (img.id !== selectedItem.id) return img;

        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = resizeStart.startX;
        let newY = resizeStart.startY;

        switch (resizeHandle) {
          case 'se': // bottom-right
            newWidth = Math.max(50, resizeStart.width + deltaX);
            newHeight = Math.max(50, resizeStart.height + deltaY);
            break;
          case 'sw': // bottom-left
            newWidth = Math.max(50, resizeStart.width - deltaX);
            newHeight = Math.max(50, resizeStart.height + deltaY);
            newX = resizeStart.startX + (resizeStart.width - newWidth);
            break;
          case 'ne': // top-right
            newWidth = Math.max(50, resizeStart.width + deltaX);
            newHeight = Math.max(50, resizeStart.height - deltaY);
            newY = resizeStart.startY + (resizeStart.height - newHeight);
            break;
          case 'nw': // top-left
            newWidth = Math.max(50, resizeStart.width - deltaX);
            newHeight = Math.max(50, resizeStart.height - deltaY);
            newX = resizeStart.startX + (resizeStart.width - newWidth);
            newY = resizeStart.startY + (resizeStart.height - newHeight);
            break;
          default:
            break;
        }

        return { ...img, width: newWidth, height: newHeight, x: newX, y: newY };
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
  };

  const handleTextEdit = (id, newContent) => {
    setTexts(prev => prev.map(txt => 
      txt.id === id ? { ...txt, content: newContent } : txt
    ));
  };

  const deleteItem = (id, type) => {
    if (type === 'image') {
      setImages(prev => prev.filter(img => img.id !== id));
    } else {
      setTexts(prev => prev.filter(txt => txt.id !== id));
    }
    setSelectedItem(null);
  };

  const rotateImage = (id, direction) => {
    setImages(prev => prev.map(img => {
      if (img.id === id) {
        const newRotation = (img.rotation + (direction === 'left' ? -90 : 90)) % 360;
        return { ...img, rotation: newRotation };
      }
      return img;
    }));
  };

  const addPage = () => {
    setPages(prev => [...prev, { id: Date.now(), images: [], texts: [] }]);
    setCurrentPage(pages.length);
  };

  const nextPage = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(currentPage + 1);
      setSelectedItem(null);
    }
  };

  const prevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
      setSelectedItem(null);
    }
  };

  const deletePage = () => {
    if (pages.length > 1) {
      setPages(prev => prev.filter((_, index) => index !== currentPage));
      setCurrentPage(Math.max(0, currentPage - 1));
    }
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    
    try {
      // Compress images before sending to API
      const compressedPages = await Promise.all(pages.map(async (page) => {
        const compressedImages = await Promise.all(page.images.map(async (img) => {
          // Create a canvas to compress the image
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const image = new Image();
          
          return new Promise((resolve) => {
            image.onload = () => {
              // Limit max dimensions to reduce size
              const maxDim = 1200;
              let width = image.width;
              let height = image.height;
              
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = (height / width) * maxDim;
                  width = maxDim;
                } else {
                  width = (width / height) * maxDim;
                  height = maxDim;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(image, 0, 0, width, height);
              
              // Compress to JPEG with 0.7 quality
              const compressedSrc = canvas.toDataURL('image/jpeg', 0.7);
              resolve({ ...img, src: compressedSrc });
            };
            image.src = img.src;
          });
        }));
        
        return { ...page, images: compressedImages };
      }));
      
      // Use relative URL in production (Vercel), absolute URL in development
      const apiUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001/generate-pdf' 
        : '/api/generate-pdf';
      
      console.log('Calling API:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pages: compressedPages,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        
        // Ensure the blob has the correct MIME type
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `collage-${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 100);
        
        alert('PDF downloaded successfully!');
      } else {
        alert('PDF generation failed. Make sure the backend server is running on port 3001.');
      }
    } catch (error) {
      alert('Could not connect to backend server. Please try again.');
      console.error('Error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: '0', paddingBottom: '2rem' }}>
      <div style={{ maxWidth: '90rem', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem', paddingTop: '0.5rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '700', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: '0.5rem' }}>
            Upload, Arrange & Create PDF
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1rem' }}>Design beautiful PDF documents with drag-and-drop simplicity</p>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '0.875rem 1.75rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: '600', transition: 'all 0.3s', boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)' }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)' }}
          >
            <Upload size={20} />
            Upload Images
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          
          <button
            onClick={addText}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white', padding: '0.875rem 1.75rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: '600', transition: 'all 0.3s', boxShadow: '0 4px 15px rgba(245, 87, 108, 0.4)' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(245, 87, 108, 0.6)' }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(245, 87, 108, 0.4)' }}
          >
            <Type size={20} />
            Add Text
          </button>

          <button
            onClick={addPage}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white', padding: '0.875rem 1.75rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: '600', transition: 'all 0.3s', boxShadow: '0 4px 15px rgba(79, 172, 254, 0.4)' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 172, 254, 0.6)' }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(79, 172, 254, 0.4)' }}
          >
            <Plus size={20} />
            Add Page
          </button>

          <button
            onClick={generatePDF}
            disabled={isGenerating}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: isGenerating ? '#475569' : 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: 'white', padding: '0.875rem 1.75rem', borderRadius: '0.75rem', border: 'none', cursor: isGenerating ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: '600', transition: 'all 0.3s', boxShadow: isGenerating ? 'none' : '0 4px 15px rgba(250, 112, 154, 0.4)' }}
            onMouseOver={(e) => !isGenerating && (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = '0 6px 20px rgba(250, 112, 154, 0.6)')}
            onMouseOut={(e) => !isGenerating && (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 4px 15px rgba(250, 112, 154, 0.4)')}
          >
            <Download size={20} />
            {isGenerating ? 'Generating...' : 'Download PDF'}
          </button>
        </div>

        {/* Canvas Container with scaling */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', maxHeight: 'calc(100vh - 180px)' }}>
          <div
            style={{
              transform: 'scale(0.7)',
              transformOrigin: 'top center',
            }}
          >
            <div
              ref={canvasRef}
              style={{ 
                width: '794px', 
                height: '1123px', 
                border: 'none',
                overflow: 'visible',
                position: 'relative',
                touchAction: 'pan-y',
                background: 'white',
                borderRadius: '1rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
            >
          {/* Images */}
          {console.log('Rendering images.map, images.length:', images.length)}
          {images.map((img) => {
            console.log('Rendering image:', img.id, 'at', img.x, img.y, 'size:', img.width, img.height, 'src length:', img.src?.length);
            console.log('Image src preview:', img.src?.substring(0, 100));
            const isSelected = selectedItem?.id === img.id;
            return (
            <div
              key={img.id}
              style={{
                position: 'absolute',
                left: `${img.x}px`,
                top: `${img.y}px`,
                width: `${img.width}px`,
                height: `${img.height}px`,
                cursor: 'default',
                border: isSelected ? '3px solid #3b82f6' : 'none',
                transform: `rotate(${img.rotation || 0}deg)`,
                transformOrigin: 'center center',
                zIndex: isSelected ? 1000 : 1,
              }}
              onClick={() => setSelectedItem({ ...img, type: 'image' })}
              onTouchStart={() => setSelectedItem({ ...img, type: 'image' })}
            >
              {/* Drag Handle - Only for mobile */}
              {window.innerWidth < 768 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '4px',
                    left: '4px',
                    background: 'rgba(59, 130, 246, 0.9)',
                    borderRadius: '0.375rem',
                    padding: '0.5rem',
                    cursor: 'move',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    touchAction: 'none'
                  }}
                  onMouseDown={(e) => { setSelectedItem({ ...img, type: 'image' }); handleMouseDown(e, img, 'image'); }}
                  onTouchStart={(e) => { e.preventDefault(); setSelectedItem({ ...img, type: 'image' }); handleMouseDown(e, img, 'image'); }}
                >
                  <GripVertical size={20} color="white" />
                  <span style={{ fontSize: '0.625rem', color: 'white', fontWeight: '600', whiteSpace: 'nowrap' }}>Drag</span>
                </div>
              )}
              {/* Resize Handle - Only for mobile when selected */}
              {window.innerWidth < 768 && isSelected && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    right: '4px',
                    background: 'rgba(34, 197, 94, 0.9)',
                    borderRadius: '0.375rem',
                    padding: '0.5rem',
                    cursor: 'se-resize',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    touchAction: 'none'
                  }}
                  onMouseDown={(e) => handleResizeStart(e, img, 'se')}
                  onTouchStart={(e) => { e.preventDefault(); handleResizeStart(e, img, 'se'); }}
                >
                  <Maximize2 size={20} color="white" />
                  <span style={{ fontSize: '0.625rem', color: 'white', fontWeight: '600', whiteSpace: 'nowrap' }}>Resize</span>
                </div>
              )}
              {/* Desktop: whole image is draggable */}
              <div
                style={{ width: '100%', height: '100%' }}
                onMouseDown={window.innerWidth >= 768 ? (e) => handleMouseDown(e, img, 'image') : undefined}
              >
              <img
                src={img.src}
                alt="uploaded"
                style={{ 
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  pointerEvents: 'none',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}
                draggable={false}
                onLoad={() => console.log('IMG element loaded successfully:', img.id)}
                onError={(e) => {
                  console.error('IMG element error:', img.id);
                  console.error('Error event:', e.nativeEvent);
                  console.error('Image src (first 100 chars):', img.src?.substring(0, 100));
                  console.error('Image target:', e.target);
                }}
              />
              {isSelected && (
                <>
                  {/* Resize handles - Desktop only */}
                  {window.innerWidth >= 768 && (
                    <>
                      <div
                        onMouseDown={(e) => handleResizeStart(e, img, 'nw')}
                        style={{
                          position: 'absolute',
                          top: '-12px',
                          left: '-12px',
                          width: '24px',
                          height: '24px',
                          background: '#3b82f6',
                          border: '2px solid white',
                          borderRadius: '50%',
                          cursor: 'nw-resize',
                          zIndex: 10,
                        }}
                      />
                      <div
                        onMouseDown={(e) => handleResizeStart(e, img, 'ne')}
                        style={{
                          position: 'absolute',
                          top: '-12px',
                          right: '-12px',
                          width: '24px',
                          height: '24px',
                          background: '#3b82f6',
                          border: '2px solid white',
                          borderRadius: '50%',
                          cursor: 'ne-resize',
                          zIndex: 10,
                        }}
                      />
                      <div
                        onMouseDown={(e) => handleResizeStart(e, img, 'sw')}
                        style={{
                          position: 'absolute',
                          bottom: '-12px',
                          left: '-12px',
                          width: '24px',
                          height: '24px',
                          background: '#3b82f6',
                          border: '2px solid white',
                          borderRadius: '50%',
                          cursor: 'sw-resize',
                          zIndex: 10,
                        }}
                      />
                      <div
                        onMouseDown={(e) => handleResizeStart(e, img, 'se')}
                        style={{
                          position: 'absolute',
                          bottom: '-12px',
                          right: '-12px',
                          width: '24px',
                          height: '24px',
                          background: '#3b82f6',
                          border: '2px solid white',
                      borderRadius: '50%',
                      cursor: 'se-resize',
                      zIndex: 10,
                    }}
                  />
                    </>
                  )}
                  {/* Rotation buttons - bottom left */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      rotateImage(img.id, 'left');
                    }}
                    style={{ position: 'absolute', bottom: '-0.5rem', left: '-2.5rem', background: '#22c55e', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', zIndex: 10 }}
                    title="Rotate left"
                    onMouseOver={(e) => e.target.style.background = '#16a34a'}
                    onMouseOut={(e) => e.target.style.background = '#22c55e'}
                  >
                    ↺
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      rotateImage(img.id, 'right');
                    }}
                    style={{ position: 'absolute', bottom: '-0.5rem', left: '1.5rem', background: '#22c55e', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', zIndex: 10 }}
                    title="Rotate right"
                    onMouseOver={(e) => e.target.style.background = '#16a34a'}
                    onMouseOut={(e) => e.target.style.background = '#22c55e'}
                  >
                    ↻
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteItem(img.id, 'image');
                    }}
                    style={{ position: 'absolute', top: '-0.5rem', right: '-0.5rem', background: '#ef4444', color: 'white', padding: '0.25rem', borderRadius: '50%', border: 'none', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseOver={(e) => e.target.style.background = '#dc2626'}
                    onMouseOut={(e) => e.target.style.background = '#ef4444'}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
              </div>
            </div>
          )})}



          {/* Texts */}
          {texts.map((txt) => (
            <div
              key={txt.id}
              style={{
                position: 'absolute',
                left: `${txt.x}px`,
                top: `${txt.y}px`,
                cursor: 'move',
                border: selectedItem?.id === txt.id ? '2px dashed #3b82f6' : 'none',
                padding: '4px',
              }}
              onMouseDown={(e) => handleMouseDown(e, txt, 'text')}
              onTouchStart={(e) => handleMouseDown(e, txt, 'text')}
              onDoubleClick={(e) => {
                e.stopPropagation();
                const newContent = prompt('Edit text:', txt.content);
                if (newContent !== null) handleTextEdit(txt.id, newContent);
              }}
            >
              <div
                style={{
                  fontSize: `${txt.fontSize}px`,
                  color: txt.color,
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
              >
                {txt.content}
              </div>
              {selectedItem?.id === txt.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteItem(txt.id, 'text');
                  }}
                  style={{ position: 'absolute', top: '-0.5rem', right: '-0.5rem', background: '#ef4444', color: 'white', padding: '0.25rem', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseOver={(e) => e.target.style.background = '#dc2626'}
                  onMouseOut={(e) => e.target.style.background = '#ef4444'}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}

          {images.length === 0 && texts.length === 0 && (
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
              <div style={{ textAlign: 'center' }}>
                <ImagePlus size={64} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                <p style={{ fontSize: '1.25rem' }}>Upload images or add text to get started</p>
              </div>
            </div>
          )}
            </div>
          </div>
        </div>

        {/* Page Navigation - Below Canvas */}
        <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', borderRadius: window.innerWidth < 768 ? '0' : '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', padding: window.innerWidth < 768 ? '0.75rem 1rem' : '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: window.innerWidth < 768 ? '100%' : '56rem', margin: window.innerWidth < 768 ? '0' : '0.5rem auto 1rem', border: '1px solid rgba(255, 255, 255, 0.1)', position: window.innerWidth < 768 ? 'fixed' : 'relative', bottom: window.innerWidth < 768 ? '0' : 'auto', left: window.innerWidth < 768 ? '0' : 'auto', right: window.innerWidth < 768 ? '0' : 'auto', zIndex: window.innerWidth < 768 ? 1000 : 'auto' }}>
          <button
            onClick={prevPage}
            disabled={currentPage === 0}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: currentPage === 0 ? '#334155' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: currentPage === 0 ? '#64748b' : 'white', padding: window.innerWidth < 768 ? '0.5rem' : '0.75rem', borderRadius: '0.5rem', border: 'none', cursor: currentPage === 0 ? 'not-allowed' : 'pointer', transition: 'all 0.3s', width: window.innerWidth < 768 ? '36px' : '48px', height: window.innerWidth < 768 ? '36px' : '48px', boxShadow: currentPage === 0 ? 'none' : '0 4px 15px rgba(102, 126, 234, 0.4)', flexShrink: 0 }}
            onMouseOver={(e) => currentPage !== 0 && (e.currentTarget.style.transform = 'scale(1.1)', e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)')}
            onMouseOut={(e) => currentPage !== 0 && (e.currentTarget.style.transform = 'scale(1)', e.currentTarget.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)')}
          >
            <ChevronLeft size={window.innerWidth < 768 ? 18 : 24} />
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: window.innerWidth < 768 ? '0.5rem' : '1rem', flex: 1, justifyContent: 'center' }}>
            <span style={{ fontSize: window.innerWidth < 768 ? '0.875rem' : '1.125rem', fontWeight: '700', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', whiteSpace: 'nowrap' }}>
              Page {currentPage + 1} of {pages.length}
            </span>
            {pages.length > 1 && (
              <button
                onClick={deletePage}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white', padding: window.innerWidth < 768 ? '0.375rem 0.625rem' : '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontSize: window.innerWidth < 768 ? '0.75rem' : '0.875rem', fontWeight: '600', transition: 'all 0.3s', boxShadow: '0 4px 15px rgba(245, 87, 108, 0.4)', whiteSpace: 'nowrap' }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(245, 87, 108, 0.6)' }}
                onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(245, 87, 108, 0.4)' }}
              >
                <Trash2 size={window.innerWidth < 768 ? 12 : 16} />
                {window.innerWidth >= 768 ? 'Delete' : ''}
              </button>
            )}
          </div>
          
          <button
            onClick={nextPage}
            disabled={currentPage === pages.length - 1}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: currentPage === pages.length - 1 ? '#334155' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: currentPage === pages.length - 1 ? '#64748b' : 'white', padding: window.innerWidth < 768 ? '0.5rem' : '0.75rem', borderRadius: '0.5rem', border: 'none', cursor: currentPage === pages.length - 1 ? 'not-allowed' : 'pointer', transition: 'all 0.3s', width: window.innerWidth < 768 ? '36px' : '48px', height: window.innerWidth < 768 ? '36px' : '48px', boxShadow: currentPage === pages.length - 1 ? 'none' : '0 4px 15px rgba(102, 126, 234, 0.4)', flexShrink: 0 }}
            onMouseOver={(e) => currentPage !== pages.length - 1 && (e.currentTarget.style.transform = 'scale(1.1)', e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)')}
            onMouseOut={(e) => currentPage !== pages.length - 1 && (e.currentTarget.style.transform = 'scale(1)', e.currentTarget.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)')}
          >
            <ChevronRight size={window.innerWidth < 768 ? 18 : 24} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;