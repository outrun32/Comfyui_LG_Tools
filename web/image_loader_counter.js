/**
 * LG_ImageLoaderWithCounter 前端扩展
 * 为带计数器的图片加载器节点提供前端UI支持
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "LG.ImageLoaderWithCounter",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LG_ImageLoaderWithCounter") {
            
            // 保存原始的 onNodeCreated 方法
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // 初始化显示文本
                this.currentCountText = "";
                this.totalImagesText = "";
                
                // 添加刷新按钮
                this.addWidget("button", "refresh", "🔄 Refresh Counter", () => {
                    this.resetImageLoaderCounter();
                });
                
                return r;
            };

            // 重写 onDrawForeground 方法来显示计数和总数
            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function(ctx) {
                const r = onDrawForeground?.apply?.(this, arguments);

                // 如果有计数文本要显示
                if (this.currentCountText) {
                    ctx.save();

                    // 设置文本样式 - 在标题栏右上角显示
                    ctx.font = "bold 20px sans-serif";
                    ctx.textAlign = "right";
                    ctx.textBaseline = "top";
                    ctx.fillStyle = "#00ff00"; // 绿色

                    // 构建显示文本：当前索引/总数
                    let displayText = this.currentCountText;
                    if (this.totalImagesText) {
                        displayText = `${this.currentCountText}/${this.totalImagesText}`;
                    }

                    // 在标题栏右上角显示计数
                    const rightX = this.size[0] - 20; // 距离右边20像素
                    const topY = -25; // 距离顶部25像素，标题栏内

                    // 添加文本阴影以提高可读性
                    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                    ctx.shadowBlur = 3;
                    ctx.shadowOffsetX = 1;
                    ctx.shadowOffsetY = 1;

                    ctx.fillText(displayText, rightX, topY);
                    
                    ctx.restore();
                }

                return r;
            };

            // 添加重置图片加载器计数器的方法
            nodeType.prototype.resetImageLoaderCounter = async function() {
                try {
                    const response = await api.fetchApi("/image_loader_counter/reset", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            node_id: this.id.toString()
                        })
                    });
                    
                    const result = await response.json();

                    if (result.status === "success") {
                        console.log("Image loader counter has been reset:", result.message);
                        // 更新显示
                        this.currentCountText = result.current.toString();
                        this.setDirtyCanvas(true, true);
                    } else {
                        console.error("Failed to reset counter:", result.message);
                    }
                } catch (error) {
                    console.error("Error occurred while resetting counter:", error);
                }
            };
            
            // 添加右键菜单选项
            const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
            nodeType.prototype.getExtraMenuOptions = function(_, options) {
                const r = getExtraMenuOptions ? getExtraMenuOptions.apply(this, arguments) : undefined;
                
                options.unshift({
                    content: "🔄 Reset Counter",
                    callback: () => {
                        this.resetImageLoaderCounter();
                    }
                });
                
                return r;
            };
        }
    },

    /**
     * 监听后端发送的计数更新事件
     */
    async setup() {
        api.addEventListener("counter_update", ({ detail }) => {
            if (!detail || !detail.node_id) return;
            
            const node = app.graph._nodes_by_id[detail.node_id];
            if (node && node.type === "LG_ImageLoaderWithCounter") {
                // 更新显示文本
                node.currentCountText = detail.count.toString();
                // 如果有总数信息，也更新
                if (detail.total !== undefined) {
                    node.totalImagesText = detail.total.toString();
                }
                // 触发重绘
                node.setDirtyCanvas(true, true);
                
                console.log(`[ImageLoaderCounter] Node ${detail.node_id} index updated: ${detail.count}/${detail.total || '?'}`);
            }
        });
    }
});

