import { app } from "../../../scripts/app.js";
import { api } from "../../scripts/api.js";

class BaseNode extends LGraphNode {
    static defaultComfyClass = "BaseNode"; 
     constructor(title, comfyClass) {
        super(title);
        this.isVirtualNode = false;
        this.configuring = false;
        this.__constructed__ = false;
        this.widgets = this.widgets || [];
        this.properties = this.properties || {};

        this.comfyClass = comfyClass || this.constructor.comfyClass || BaseNode.defaultComfyClass;
         setTimeout(() => {
            this.checkAndRunOnConstructed();
        });
    }

    checkAndRunOnConstructed() {
        if (!this.__constructed__) {
            this.onConstructed();
        }
        return this.__constructed__;
    }

    onConstructed() {
        if (this.__constructed__) return false;
        this.type = this.type ?? undefined;
        this.__constructed__ = true;
        return this.__constructed__;
    }

    configure(info) {
        this.configuring = true;
        super.configure(info);
        for (const w of this.widgets || []) {
            w.last_y = w.last_y || 0;
        }
        this.configuring = false;
    }
    static setUp() {
        if (!this.type) {
            throw new Error(`Missing type for ${this.name}: ${this.title}`);
        }
        LiteGraph.registerNodeType(this.type, this);
        if (this._category) {
            this.category = this._category;
        }
    }
}


class ImageDisplayNode extends BaseNode {
    static type = "Advertisement";
    static title = "🎈Advertisement";
    static category = "🎈LAOGOU/Utils";
    static _category = "🎈LAOGOU/Utils";
    static comfyClass = "Advertisement";
     constructor(title = ImageDisplayNode.title) {
        super(title, ImageDisplayNode.comfyClass); 
        this.comfyClass = "Advertisement";
        this.resizable = true;
        this.size = [200, 200];
        this.media = null; 
        this.mediaType = null; 
        this.isVirtualNode = true;
        
        // 设置节点属性
        this.properties = {
            borderRadius: 0,
            backgroundColor: "transparent",
            padding: 0,
            fitMode: "contain",
            flipH: false,
            flipV: false,
            autoplay: true,
            loop: true,
            mediaSource: "",
            volume: 0,    
        };

        // 移除默认标题栏
        this.flags = {
            showTitle: false
        };

        // 设置节点颜色为透明
        this.color = "transparent";
        this.bgcolor = "transparent";
        
        this.onConstructed();
        this.isDraggingOver = false;
        this.gifPlayer = null;
        this.scriptPath = import.meta.url;
    }
    setProperty(name, value) {
        super.setProperty(name, value);
        
        if (name === "mediaSource" && value) {
            this.handleMediaSource(value).catch(error => {
                console.error("Failed to process media source:", error);
                alert("Failed to process media source: " + error.message);
            });
        }
    }

    async handleMediaSource(source) {
        try {
            let file;
            
            if (source.startsWith('http://') || source.startsWith('https://')) {
                // 处理网络地址
                console.log('Starting to download network file:', source);
                
                // 通过后端代理下载
                const response = await api.fetchApi('/proxy_download', {
                    method: 'POST',
                    body: JSON.stringify({
                        url: source
                    })
                });

                const data = await response.json();
                if (data.status === "error") {
                    throw new Error(data.message || 'Failed to download file');
                }

                // 获取已下载的文件
                const fileResponse = await fetch(this.getViewPath(`input/image_display/${data.name}`));
                if (!fileResponse.ok) {
                    throw new Error('Failed to load downloaded file');
                }
                
                const blob = await fileResponse.blob();
                file = new File([blob], data.name, { type: this.getMimeTypeFromUrl(data.name) });
                
            } else {
                const cleanPath = source.trim()
                    .replace(/[\r\n]+/g, '')
                    .replace(/^["']|["']$/g, '');  // 去除开头和结尾的引号
                
                // 处理相对路径
                let fullPath = cleanPath;
                const isRelativePath = !cleanPath.match(/^([A-Za-z]:|\/)/) && 
                                     !cleanPath.includes('/input/image_display/') && 
                                     !cleanPath.includes('\\input\\image_display\\');
                
                if (isRelativePath) {
                    // 如果是相对路径，去掉可能存在的 './'
                    fullPath = cleanPath.startsWith('./') ? cleanPath.slice(2) : cleanPath;
                }
                
                console.log('Starting to process file:', fullPath, isRelativePath ? '(relative path)' : '(absolute path)');
                
                // 检查文件是否已经在目标文件夹中
                const fileName = fullPath.split(/[\\/]/).pop();
                const targetPath = `input/image_display/${fileName}`;
                
                // 如果文件已经在目标文件夹中，直接使用
                if (cleanPath.includes('/input/image_display/') || cleanPath.includes('\\input\\image_display\\')) {
                    console.log('File already in target folder, using directly');
                    const fileResponse = await fetch(this.getViewPath(`input/image_display/${fileName}`));
                    if (!fileResponse.ok) {
                        throw new Error('Failed to load file');
                    }
                    
                    const blob = await fileResponse.blob();
                    const mimeType = this.getMimeTypeFromUrl(fileName);
                    file = new File([blob], fileName, { type: mimeType });
                    

                    if (file.type.startsWith('video/')) {
                        await this.loadVideo(file);
                    } else if (file.type.startsWith('image/')) {
                        if (file.type === 'image/gif') {
                            await this.loadGif(file);
                        } else {
                            await this.loadImage(file);
                        }
                    }
                    return; 
                }

                const response = await api.fetchApi('/upload_from_path', {
                    method: 'POST',
                    body: JSON.stringify({
                        path: fullPath,
                        subfolder: 'image_display',
                        type: 'input',
                        relative: isRelativePath
                    })
                });
    
                const data = await response.json();
                if (data.status === "error") {
                    throw new Error(data.message || 'Failed to process local file');
                }
    
                // 获取复制后的文件
                const fileResponse = await fetch(this.getViewPath(`input/image_display/${fileName}`));
                if (!fileResponse.ok) {
                    throw new Error('Failed to load file');
                }
                
                const blob = await fileResponse.blob();
                const mimeType = this.getMimeTypeFromUrl(fileName);
                file = new File([blob], fileName, { type: mimeType });
            }
    
            // 保存和加载媒体
            console.log('Starting to save file:', file.name);
            const savedPath = await this.saveMediaToTemp(file);
            if (!savedPath) {
                throw new Error('Failed to save file');
            }
    
            // 根据文件类型加载媒体
            if (file.type.startsWith('video/')) {
                await this.loadVideo(file);
            } else if (file.type.startsWith('image/')) {
                if (file.type === 'image/gif') {
                    await this.loadGif(file);
                } else {
                    await this.loadImage(file);
                }
            }
    
        } catch (error) {
            console.error('Failed to process media source:', error);
            throw error;
        }
    }

    getFileNameFromUrl(source) {
        if (source.startsWith('http')) {
            const urlParts = source.split(/[#?]/)[0].split('/');
            return decodeURIComponent(urlParts.pop() || 'unknown');
        } else {
            // 处理本地路径
            return source.split(/[\\/]/).pop();
        }
    }

    getMimeTypeFromUrl(source) {
        const ext = source.split('.').pop().toLowerCase();
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'mp4': 'video/mp4',
            'webm': 'video/webm'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
    async loadGifLibrary() {
        try {

            const basePath = this.scriptPath.substring(0, this.scriptPath.lastIndexOf('/'));
            const libPath = `${basePath}/lib/libgif.js`;
            
            console.log('Loading GIF library from:', libPath); // 调试用
            
            const script = document.createElement('script');
            script.src = libPath;
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = (e) => {
                    console.error('Failed to load GIF library:', e); // 调试用
                    reject(e);
                };
                document.head.appendChild(script);
            });
            
            console.log('GIF library loaded successfully'); // 调试用
            
        } catch (error) {
            console.error('Error loading GIF library:', error);

            return false;
        }
        return true;
    }
    draw(ctx) {
        ctx.save();
        

        this.color = "transparent";
        this.bgcolor = "transparent";

        if (this.properties.backgroundColor !== "transparent") {
            ctx.beginPath();
            const borderRadius = this.properties.borderRadius || 0;
            ctx.roundRect(0, 0, this.size[0], this.size[1], [borderRadius]);
            ctx.fillStyle = this.properties.backgroundColor;
            ctx.fill();
        }
    

        if (this.media) {
            const padding = this.properties.padding || 0;
            const drawWidth = this.size[0] - (padding * 2);
            const drawHeight = this.size[1] - (padding * 2);

            let mediaWidth, mediaHeight;
            if (this.mediaType === 'video') {
                mediaWidth = this.media.videoWidth;
                mediaHeight = this.media.videoHeight;
            } else {
                mediaWidth = this.media.width;
                mediaHeight = this.media.height;
            }

            const mediaRatio = mediaWidth / mediaHeight;
            const nodeRatio = drawWidth / drawHeight;
            let finalWidth = drawWidth;
            let finalHeight = drawHeight;
            let x = padding;
            let y = padding;
    
            if (this.properties.fitMode === "contain") {
                if (mediaRatio > nodeRatio) {
                    finalHeight = drawWidth / mediaRatio;
                    y = padding + (drawHeight - finalHeight) / 2;
                } else {
                    finalWidth = drawHeight * mediaRatio;
                    x = padding + (drawWidth - finalWidth) / 2;
                }
            } else if (this.properties.fitMode === "cover") {
                if (mediaRatio > nodeRatio) {
                    finalWidth = drawHeight * mediaRatio;
                    x = padding + (drawWidth - finalWidth) / 2;
                } else {
                    finalHeight = drawWidth / mediaRatio;
                    y = padding + (drawHeight - finalHeight) / 2;
                }
            }
    
            if (this.properties.flipH || this.properties.flipV) {
                ctx.save();

                ctx.translate(x + finalWidth / 2, y + finalHeight / 2);

                ctx.scale(this.properties.flipH ? -1 : 1, this.properties.flipV ? -1 : 1);

                ctx.translate(-(x + finalWidth / 2), -(y + finalHeight / 2));
            }
        
            // 绘制媒体
            ctx.drawImage(this.media, x, y, finalWidth, finalHeight);
        

            if (this.properties.flipH || this.properties.flipV) {
                ctx.restore();
            }
    

            if (this.mediaType === 'video' || this.mediaType === 'gif') {
                requestAnimationFrame(() => {
                    if (this.graph) {
                        this.graph.setDirtyCanvas(true);
                    }
                });
            }
            if (this.mediaType === 'gif' && this.gifPlayer) {
                requestAnimationFrame(() => {
                    if (this.graph) {
                        this.graph.setDirtyCanvas(true);
                    }
                });
            }

            if (this.mediaType === 'video' && !this.properties.autoplay) {
                // 绘制播放图标
                ctx.fillStyle = "rgba(0,0,0,0.5)";
                ctx.beginPath();
                ctx.arc(this.size[0]/2, this.size[1]/2, 20, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = "#fff";
                ctx.beginPath();
                ctx.moveTo(this.size[0]/2 - 8, this.size[1]/2 - 10);
                ctx.lineTo(this.size[0]/2 - 8, this.size[1]/2 + 10);
                ctx.lineTo(this.size[0]/2 + 8, this.size[1]/2);
                ctx.closePath();
                ctx.fill();
            }
        } else {

            ctx.fillStyle = "#666";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Drag and drop media files here", this.size[0] / 2, this.size[1] / 2);
            ctx.font = "12px Arial";
            ctx.fillText("Supports images, GIF, and video", this.size[0] / 2, this.size[1] / 2 + 20);
        }
    
        ctx.restore();
    }

    onDragOver(e, local_pos, canvas) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        
        // 更新拖放状态
        if (!this.isDraggingOver) {
            this.isDraggingOver = true;
            this.graph.setDirtyCanvas(true);
        }
        return true;
    }

    onDragLeave(e) {
        this.isDraggingOver = false;
        this.graph.setDirtyCanvas(true);
    }

    onDragDrop(e, local_pos, canvas) {
        e.preventDefault();
        e.stopPropagation();
        this.isDraggingOver = false;
    
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            const type = file.type.toLowerCase();
    
            if (this.media) {
                if (this.mediaType === 'video') {
                    this.media.pause();
                    URL.revokeObjectURL(this.media.src);
                }
                this.media = null;
            }
    
            if (type.startsWith('video/')) {
                this.loadVideo(file);
            } else if (type.startsWith('image/')) {
                if (type === 'image/gif') {
                    this.loadGif(file);
                } else {
                    this.loadImage(file);
                }
            }
        }
    
        this.graph.setDirtyCanvas(true);
        return true;
    }

    async saveMediaToTemp(file, subfolder = 'image_display') {
        try {

            this.originalFileName = file.name;
    

            const formData = new FormData();
            formData.append('image', file);
            formData.append('type', 'input');  
            formData.append('subfolder', subfolder);
            formData.append('overwrite', 'true');
            
            const response = await api.fetchApi('/upload/image', {
                method: 'POST',
                body: formData
            });
    
            const responseData = await response.json();
            if (responseData?.name) {
                const path = `input/${subfolder}/${responseData.name}`;
                return path;
            }
            return null;
        } catch (error) {
            console.error('Failed to save file:', error);
            return null;
        }
    }

    serialize() {
        const data = super.serialize();
        if (this.media && this.tempFilePath) {

            data.mediaType = this.mediaType;
            data.tempFilePath = this.tempFilePath;
        }
        return data;
    }

    getViewPath(filePath) {
        const filename = filePath.split('/').pop();
        const subfolder = filePath.split('/')[1]; 
        return `/view?filename=${filename}&type=input&subfolder=${subfolder}`; 
    }


    createMediaElement(type, viewPath, autoplay = false, loop = false) {
        switch(type) {
            case 'video':
                const video = document.createElement('video');
                video.autoplay = autoplay;
                video.loop = loop;
                video.muted = true; 
                video.volume = this.properties.volume;
                video.playsInline = true;
                video.src = viewPath;
                return video;
                
            case 'gif':
                const tempImg = document.createElement('img');
                tempImg.src = viewPath;
                return tempImg;
                
            default: // 'image'
                const img = new Image();
                img.src = viewPath;
                return img;
        }
    }

    configure(info) {
        super.configure(info);
        if (!info.mediaType || !info.tempFilePath) return;
        
        this.tempFilePath = info.tempFilePath;
        const viewPath = this.getViewPath(this.tempFilePath);
        
        if (info.mediaType === 'gif') {
            this.handleGif(viewPath);
            return;
        }
        
        const element = this.createMediaElement(
            info.mediaType, 
            viewPath, 
            this.properties.autoplay, 
            this.properties.loop
        );
        
        const loadHandler = info.mediaType === 'video' ? 'onloadedmetadata' : 'onload';
        element[loadHandler] = () => {
            this.media = element;
            this.mediaType = info.mediaType;
            if (info.mediaType === 'video' && this.properties.autoplay) {
                element.play().catch(console.error);
            }
            this.graph?.setDirtyCanvas(true);
        };
        if (this.mediaType === 'video') {
            this.updateAudioSettings();
        }
    }

    async handleGif(viewPath) {
        if (typeof SuperGif === 'undefined') {
            await this.loadGifLibrary();
        }

        const tempImg = this.createMediaElement('gif', viewPath);
        this.gifPlayer = new SuperGif({ 
            gif: tempImg, 
            auto_play: true,
            loop_mode: true
        });

        return new Promise((resolve) => {
            this.gifPlayer.load(() => {
                this.media = this.gifPlayer.get_canvas();
                this.mediaType = 'gif';
                this.graph?.setDirtyCanvas(true);
                resolve();
            });
        });
    }
    async loadMedia(file, type) {
        console.log(`Starting to load ${type}:`, file.name);
        
        const tempPath = await this.saveMediaToTemp(file);
        if (!tempPath) {
            console.error(`Failed to save ${type}`);
            return;
        }
        
        this.tempFilePath = tempPath;
        const viewPath = this.getViewPath(tempPath);
        console.log('构建的访问路径:', viewPath);
        
        if (type === 'gif') {
            await this.handleGif(viewPath);
            return;
        }
        
        const element = this.createMediaElement(
            type, 
            viewPath, 
            this.properties.autoplay, 
            this.properties.loop
        );
        
        const loadHandler = type === 'video' ? 'onloadedmetadata' : 'onload';
        element[loadHandler] = () => {
            this.media = element;
            this.mediaType = type;
            if (type === 'video' && this.properties.autoplay) {
                element.play().catch(e => console.warn("Video autoplay failed:", e));
            }
            this.graph.setDirtyCanvas(true);
        };
    }


    loadImage(file) { return this.loadMedia(file, 'image'); }
    loadGif(file) { return this.loadMedia(file, 'gif'); }
    updateAudioSettings() {
        if (this.media && this.mediaType === 'video') {
            console.log('Updating audio settings, current volume:', this.properties.volume); 
            this.media.volume = this.properties.volume;
            this.media.muted = false;
        }
    }

    loadVideo(file) {
        return this.loadMedia(file, 'video').then(() => {
            if (this.media) {
                this.media.muted = true;
                this.media.play().then(() => {
                    if (this.properties.volume > 0) {
                        this.media.muted = false;
                        this.media.volume = this.properties.volume;
                    }
                }).catch(console.error);
            }
        });
    }

    clone() {
        const cloned = super.clone();
        
        if (this.mediaType && this.tempFilePath) {
            cloned.mediaType = this.mediaType;
            cloned.tempFilePath = this.tempFilePath;
            
            const viewPath = this.getViewPath(this.tempFilePath);
            
            if (this.mediaType === 'gif') {
                cloned.handleGif(viewPath);
                return cloned;
            }
            
            const element = this.createMediaElement(
                this.mediaType, 
                viewPath, 
                this.properties.autoplay, 
                this.properties.loop
            );
            
            const loadHandler = this.mediaType === 'video' ? 'onloadedmetadata' : 'onload';
            element[loadHandler] = () => {
                cloned.media = element;
                if (this.mediaType === 'video' && cloned.properties.autoplay) {
                    element.play().catch(console.error);
                }
                cloned.graph?.setDirtyCanvas(true);
            };
        }
        
        return cloned;
    }
    

    getExtraMenuOptions(canvas, options) {
        const node = this; 
        const volumeId = `volume-${Date.now()}`;
        const fileInputId = `file-input-${Date.now()}`;
         // 创建隐藏的文件输入框
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = fileInputId;
        fileInput.style.display = 'none';
        fileInput.accept = 'video/*,audio/*,image/*,.gif'; 
        document.body.appendChild(fileInput);
         // 监听文件选择
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
             try {
                // 根据文件类型调用相应的加载方法
                if (file.type.startsWith('video/')) {
                    await this.loadVideo(file);
                } else if (file.type.startsWith('audio/')) {
                    await this.loadMedia(file, 'audio');
                } else if (file.type.startsWith('image/')) {
                    if (file.type === 'image/gif') {
                        await this.loadGif(file);
                    } else {
                        await this.loadImage(file);
                    }
                }
                 canvas.setDirty(true);
            } catch (error) {
                console.error('Failed to load media file:', error);
            } finally {
                // 清理文件输入框
                document.body.removeChild(fileInput);
            }
        });
         options.unshift(  // 在开头添加上传选项
            {
                content: "Upload Media File",
                callback: () => {
                    fileInput.click();
                }
            },
            null,  // 添加分隔线
        );
        options.push(
            {
                content: "Flip Horizontal",
                callback: () => {
                    this.properties.flipH = !this.properties.flipH;
                    canvas.setDirty(true);
                }
            },
            {
                content: "Flip Vertical",
                callback: () => {
                    this.properties.flipV = !this.properties.flipV;
                    canvas.setDirty(true);
                }
            },
            null,

            ...(this.mediaType === 'video' ? [
                {
                    content: this.properties.autoplay ? "Disable Autoplay" : "Enable Autoplay",
                    callback: () => {
                        this.properties.autoplay = !this.properties.autoplay;
                        if (this.media) {
                            if (this.properties.autoplay) {
                                this.media.play().catch(e => console.error('Playback failed:', e));
                            } else {
                                this.media.pause();
                            }
                            this.media.autoplay = this.properties.autoplay;
                        }
                        canvas.setDirty(true);
                    }
                },
                {
                    content: this.properties.loop ? "Disable Loop" : "Enable Loop",
                    callback: () => {
                        this.properties.loop = !this.properties.loop;
                        if (this.media) {
                            this.media.loop = this.properties.loop;
                            if (this.properties.loop && this.properties.autoplay) {
                                this.media.play().catch(e => console.error('Playback failed:', e));
                            }
                        }
                        canvas.setDirty(true);
                    }
                },
                null,
                {
                    content: `<div style="padding: 5px">
                        <div id="${volumeId}-label">Volume: ${Math.round((this.properties.volume || 0) * 100)}%</div>
                        <input type="range"
                               id="${volumeId}-slider"
                               min="0"
                               max="1"
                               step="0.01"
                               value="${this.properties.volume}"
                               style="width: 150px"
                               onmousedown="event.stopPropagation()"
                        />
                    </div>`,
                    isHTML: true,
                    callback: () => false
                }
            ] : []),
            null,
            {
                content: "Clear Media",
                callback: () => {
                    // 处理视频媒体
                    if (this.media && this.mediaType === 'video') {
                        this.media.pause();
                        URL.revokeObjectURL(this.media.src);
                    }
                    
                    if (this.properties.mediaSource && this.properties.mediaSource.startsWith('blob:')) {
                        URL.revokeObjectURL(this.properties.mediaSource);
                    }
                    
                    // 重置所有相关属性
                    this.media = null;
                    this.mediaType = null;
                    this.properties.mediaSource = "";  // 清除 URL
                    
                    // 更新显示
                    this.updateContent();
                    canvas.setDirty(true);
                }
            }
        );  
        setTimeout(() => {
            const slider = document.getElementById(`${volumeId}-slider`);
            const label = document.getElementById(`${volumeId}-label`);
            
            if (slider && label) {
                slider.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    node.properties.volume = value;
                    if (node.media) {
                        node.media.volume = value;
                        node.media.muted = false;
                    }
                    label.textContent = `Volume: ${Math.round(value * 100)}%`;
                    node.graph.setDirtyCanvas(true);
                    e.stopPropagation();
                });
            }
        }, 0);
    }

    onRemoved() {

        if (this.mediaType === 'video' && this.media) {
            this.media.pause();
            URL.revokeObjectURL(this.media.src);
        }

        if (this.mediaType === 'gif') {
            if (this.gifPlayer) {
                // 停止 GIF 播放
                this.gifPlayer.pause();
                this.gifPlayer = null;
            }
        }
        
        this.media = null;
        this.mediaType = null;

        this.isDraggingOver = false;
    }
}


ImageDisplayNode.title_mode = LiteGraph.NO_TITLE;
ImageDisplayNode.collapsable = false;

ImageDisplayNode["@borderRadius"] = { type: "number" };
ImageDisplayNode["@backgroundColor"] = { type: "string" };
ImageDisplayNode["@padding"] = { type: "number" };
ImageDisplayNode["@fitMode"] = { type: "combo", values: ["contain", "cover", "stretch"] };
ImageDisplayNode["@volume"] = { type: "number", default: 0, min: 0, max: 1, step: 0.01 };
const oldDrawNode = LGraphCanvas.prototype.drawNode;
LGraphCanvas.prototype.drawNode = function (node, ctx) {
    if (node instanceof ImageDisplayNode) {
        node.bgcolor = "transparent";
        node.color = "transparent";
        const v = oldDrawNode.apply(this, arguments);
        node.draw(ctx);
        return v;
    }
    return oldDrawNode.apply(this, arguments);
};


app.registerExtension({
    name: "Advertisement",
    registerCustomNodes() {
        ImageDisplayNode.setUp();
    },
});

class MediaPlayerNode extends BaseNode {
    static type = "MediaPlayer";
    static title = "🎈MediaPlayer";
    static category = "🎈LAOGOU/Utils";
    static _category = "🎈LAOGOU/Utils";
    static comfyClass = "MediaPlayer";
    constructor(title = MediaPlayerNode.title) {
        super(title, MediaPlayerNode.comfyClass); 
        
        this.resizable = true;
        this.size = [320, 240];
        this.isVirtualNode = true;
        this.shape = LiteGraph.ROUND_SHAPE;
        this.serialize_widgets = true;

        // 添加属性
        this.addProperty("url", "", "string");
        this.addProperty("theme", "light", "enum", { 
            values: ["light", "dark"]
        });
        const container = document.createElement('div');
        const inner = document.createElement('div');
        this.inner = inner;
        
        container.append(inner);
        inner.classList.add('media-player-preview');
        
        container.style.cssText = `
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: white;
            display: flex;
            overflow: hidden; /* 防止容器本身出现滚动条 */
            background: transparent; /* 设置为透明 */
        `;
        
        inner.style.cssText = `
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            overflow-y: auto;    /* 只允许垂直滚动 */
            overflow-x: hidden;  /* 禁止水平滚动 */
            background: transparent; /* 设置为透明 */
        `;

        this.html_widget = this.addDOMWidget('HTML', 'html', container, {
            setValue: () => {},
            getValue: () => {},
            getMinHeight: () => this.size[1],
            onDraw: () => {
                this.html_widget.element.style.pointerEvents = 'all';
            }
        });

        this.color = "#E0E0E0"; 
        this.bgcolor = "#FFFFFF"; 

        this.flags = {
            showTitle: false
        };
        
        // 加载 marked 库
        this.loadMarkedLibrary();
        
        this.onConstructed();
        this.updateContent();
        this.applyTheme();
    }

    async loadMarkedLibrary() {
        if (typeof marked !== 'undefined') return;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = './lib/marked.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    applyTheme() {
        const isDark = this.properties.theme === 'dark';
        
        // 定义统一的颜色变量
        const colors = {
            dark: {
                nodeBg: '#1E1E1E',        // 节点背景
                nodeColor: '#2D2D2D',      // 节点边框
                contentBg: '#1E1E1E',      // 内容区背景
                textColor: '#E0E0E0',      // 文本颜色
                headingColor: '#ffffff'     // 标题颜色
            },
            light: {
                nodeBg: '#FFFFFF',
                nodeColor: '#E0E0E0',
                contentBg: '#FFFFFF',
                textColor: '#666666',
                headingColor: '#333333'
            }
        };
        
        const theme = isDark ? colors.dark : colors.light;
        
        // 设置节点颜色
        this.color = theme.nodeColor;
        this.bgcolor = theme.nodeBg;
        
        // 设置容器样式
        if (this.inner) {
            this.inner.style.background = theme.contentBg;
            
            // 构建主题样式
            const themeStyles = `
                /* 深色主题样式 */
                .dark-theme {
                    color: ${colors.dark.textColor} !important;
                    background: ${colors.dark.contentBg} !important;
                }
                .dark-theme a {
                    color: #58a6ff !important;
                }
                .dark-theme h1, 
                .dark-theme h2, 
                .dark-theme h3, 
                .dark-theme h4, 
                .dark-theme h5, 
                .dark-theme h6 {
                    color: ${colors.dark.headingColor} !important;
                }
                .dark-theme code {
                    color: #e6e6e6 !important;
                    background-color: ${colors.dark.nodeColor} !important;
                }
                .dark-theme pre {
                    background-color: ${colors.dark.nodeColor} !important;
                }
                .dark-theme blockquote {
                    color: #bebebe !important;
                    border-left-color: #4f4f4f !important;
                }
                .dark-theme table th,
                .dark-theme table td {
                    border-color: #4f4f4f !important;
                }
                .dark-theme hr {
                    border-color: #4f4f4f !important;
                }
    
                /* 浅色主题样式 */
                .markdown-body:not(.dark-theme) {
                    color: ${colors.light.textColor} !important;
                    background: ${colors.light.contentBg} !important;
                }
                .markdown-body:not(.dark-theme) h1,
                .markdown-body:not(.dark-theme) h2,
                .markdown-body:not(.dark-theme) h3,
                .markdown-body:not(.dark-theme) h4,
                .markdown-body:not(.dark-theme) h5,
                .markdown-body:not(.dark-theme) h6 {
                    color: ${colors.light.headingColor} !important;
                }
                .markdown-body:not(.dark-theme) code {
                    color: #24292f !important;
                    background-color: #f6f8fa !important;
                }
                .markdown-body:not(.dark-theme) pre {
                    background-color: #f6f8fa !important;
                }
                .markdown-body:not(.dark-theme) a {
                    color: #0969da !important;
                }
            `;
    
            // 移除旧的样式标签（如果存在）
            const oldStyle = document.getElementById('theme-styles');
            if (oldStyle) {
                oldStyle.remove();
            }
    
            // 添加新的样式标签（无论是深色还是浅色模式都添加）
            const styleTag = document.createElement('style');
            styleTag.id = 'theme-styles';
            styleTag.textContent = themeStyles;
            document.head.appendChild(styleTag);
    
            // 如果是空白状态，更新默认内容的样式
            if (!this.properties.url) {
                this.inner.innerHTML = `
                    <div style="
                        padding: 20px;
                        background: ${theme.contentBg};
                        border-radius: 4px;
                        height: 100%;
                        box-sizing: border-box;
                        color: ${theme.textColor};
                    ">
                        <h3 style="margin: 0 0 10px 0; color: ${theme.headingColor};">Media Player</h3>
                        <div>
                            Supports:<br>
                            1. Web URLs<br>
                            2. Video embed codes<br>
                            3. GitHub Markdown URLs
                        </div>
                    </div>
                `;
            }
        }
    }
    async updateContent() {
        if (!this.inner) return;
        
        let url = this.properties.url;
        if (url && url.trim()) {
            url = url.trim();
            
            // 处理 GitHub markdown URL
            if (url.includes('github.com') && (url.endsWith('.md') || url.includes('/blob/'))) {
                try {
                    // 转换为 raw URL
                    const rawUrl = url
                        .replace('github.com', 'raw.githubusercontent.com')
                        .replace('/blob/', '/');

                    console.log('Fetching GitHub markdown:', rawUrl);

                    const response = await fetch(rawUrl);
                    if (!response.ok) {
                        throw new Error('Failed to fetch Markdown content');
                    }
                    
                    let content = await response.text();
                    
                    // 处理图片路径
                    const baseUrl = rawUrl.substring(0, rawUrl.lastIndexOf('/'));
                    content = content.replace(
                        /!\[([^\]]*)\]\((?!http)([^)]+)\)/g,
                        (match, alt, path) => {
                            const imagePath = path.startsWith('./') ? path.slice(2) : path;
                            return `![${alt}](${baseUrl}/${imagePath})`;
                        }
                    );

                    const isDark = this.properties.theme === 'dark';
                    this.inner.className = `markdown-body ${isDark ? 'dark-theme' : ''}`;
                    this.inner.style.cssText = `
                        width: 100%;
                        height: 100%;
                        overflow-y: auto;
                        overflow-x: hidden;
                        padding: 16px;
                        box-sizing: border-box;
                        background: ${isDark ? '#0d1117' : 'white'};
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        word-wrap: break-word;
                        color: ${isDark ? '#E0E0E0' : '#24292f'};
                    `;

                    const styleElement = document.createElement('style');
                    styleElement.textContent = `
                        .markdown-body img {
                            max-width: 100% !important;
                            height: auto !important;
                        }
                        .markdown-body pre {
                            max-width: 100% !important;
                            overflow-x: auto !important;
                        }
                        .markdown-body table {
                            display: block !important;
                            max-width: 100% !important;
                            overflow-x: auto !important;
                        }
                        .markdown-body * {
                            max-width: 100% !important;
                            box-sizing: border-box !important;
                        }
                    `;
                    this.inner.appendChild(styleElement);
            
                    // 转换并显示 markdown
                    this.inner.innerHTML = marked.parse(content) + styleElement.outerHTML;
                    return;
                } catch (error) {
                    console.error('Failed to process Markdown:', error);
                    this.inner.innerHTML = `<div class="error" style="color: ${this.properties.theme === 'dark' ? '#ff6b6b' : '#ff0000'}">
                        Failed to load Markdown: ${error.message}</div>`;
                    return;
                }
            }
            
            if (url.includes('<iframe') || url.includes('<video')) {
                // 嵌入代码只处理 http 到 https 的改
                let secureContent = url.replace(/http:\/\//g, 'https://');
                secureContent = secureContent.replace(/\/\/player\.bilibili\.com/g, 'https://player.bilibili.com');
               
                this.inner.innerHTML = `
                    <div style="
                        width: 100%;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: ${this.properties.theme === 'dark' ? '#2D2D2D' : 'white'};
                        border-radius: 4px;
                    ">
                        ${secureContent}
                    </div>
                `;
                const elements = this.inner.querySelectorAll('iframe, video');
                elements.forEach(element => {
                    if (element.src && element.src.startsWith('http:')) {
                       element.src = element.src.replace('http:', 'https:');
                    }
                   
                    element.style.cssText = `
                        width: 100%;
                        height: 100%;
                        border: none;
                        border-radius: 4px;
                        background: black;
                        max-width: 100%;
                        max-height: 100%;
                    `;
                });
            } else {
                // 只对普通 URL 进行补全
                if (!url.match(/^https?:\/\//)) {
                    url = 'https://' + url;
                }
                    let secureUrl = url;
                    if (url.startsWith('http:')) {
                        secureUrl = url.replace('http:', 'https:');
                    }
                    this.inner.innerHTML = `
                        <iframe 
                            src="${secureUrl}"
                            style="
                                width: 100%;
                                height: 100%;
                                border: none;
                                border-radius: 4px;
                                background: ${this.properties.theme === 'dark' ? '#2D2D2D' : 'white'};
                            "
                            allowfullscreen
                            referrerpolicy="no-referrer"
                            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                        ></iframe>
                    `;
            }
        } else {

            this.applyTheme();
        }

        const iframes = this.inner.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            iframe.setAttribute('allowfullscreen', '');
            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation');
        });
    }

    onPropertyChanged(name, value) {
        super.onPropertyChanged?.(name, value);
        
        if (name === "theme") {
            this.properties[name] = value;
            // 当主题改变时，确保先应用主题再更新内容
            this.applyTheme();
            this.updateContent();
        }
        if (name === "url") {
            this.properties[name] = value;
            this.updateContent();
        }
    }
    getExtraMenuOptions() {
        // 返回全新的菜单数组，不使用或扩展现有选项
        return [
            {
                content: this.properties.theme === 'light' ? "✓ Light Theme" : "Light Theme",
                callback: () => {
                    this.setProperty("theme", "light");
                }
            },
            {
                content: this.properties.theme === 'dark' ? "✓ Dark Theme" : "Dark Theme",
                callback: () => {
                    this.setProperty("theme", "dark");
                }
            }
        ];
    }
    configure(info) {
        // 先调用父类的 configure
        super.configure(info);
        
        // 确保在配置加载后重新应用主题和更新内容
        requestAnimationFrame(() => {
            this.applyTheme();
            this.updateContent();
        });
        
        return this;
    }
}


MediaPlayerNode.collapsable = false;
app.registerExtension({
   name: "MediaPlayer",
   registerCustomNodes() {
    MediaPlayerNode.setUp();
   }
});

