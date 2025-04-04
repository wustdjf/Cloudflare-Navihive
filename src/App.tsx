import { useState, useEffect, useMemo } from "react";
import { NavigationClient } from "./API/client";
import { MockNavigationClient } from "./API/mock";
import { Site, Group } from "./API/http";
import { GroupWithSites } from "./types";
import ThemeToggle from "./components/ThemeToggle";
import GroupCard from "./components/GroupCard";
import "./App.css";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableGroupItem from "./components/SortableGroupItem";
// Material UI 导入
import { 
    Container, 
    Typography, 
    Box, 
    Button, 
    CircularProgress, 
    Alert, 
    Stack,
    Paper,
    createTheme,
    ThemeProvider,
    CssBaseline,
    TextField,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton
} from "@mui/material";
import SortIcon from '@mui/icons-material/Sort';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import GitHubIcon from '@mui/icons-material/GitHub';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';

// 根据环境选择使用真实API还是模拟API
const isDevEnvironment = import.meta.env.DEV;
const useRealApi = import.meta.env.VITE_USE_REAL_API === "true";

const api =
    isDevEnvironment && !useRealApi
        ? new MockNavigationClient()
        : new NavigationClient(isDevEnvironment ? "http://localhost:8788/api" : "/api");

// 排序模式枚举
enum SortMode {
    None, // 不排序
    GroupSort, // 分组排序
    SiteSort, // 站点排序
}

function App() {
    // 主题模式状态
    const [darkMode, setDarkMode] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            return savedTheme === 'dark';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    
    // 创建Material UI主题
    const theme = useMemo(
        () =>
            createTheme({
                palette: {
                    mode: darkMode ? 'dark' : 'light',
                },
            }),
        [darkMode]
    );
    
    // 切换主题的回调函数
    const toggleTheme = () => {
        setDarkMode(!darkMode);
        localStorage.setItem('theme', !darkMode ? 'dark' : 'light');
    };
    
    const [groups, setGroups] = useState<GroupWithSites[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortMode, setSortMode] = useState<SortMode>(SortMode.None);
    const [currentSortingGroupId, setCurrentSortingGroupId] = useState<number | null>(null);

    // 配置传感器，支持鼠标、触摸和键盘操作
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 1, // 降低激活阈值，使拖拽更敏感
                delay: 0, // 移除延迟
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 100, // 降低触摸延迟
                tolerance: 3, // 降低容忍值
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // 新增状态管理
    const [openAddGroup, setOpenAddGroup] = useState(false);
    const [openAddSite, setOpenAddSite] = useState(false);
    const [newGroup, setNewGroup] = useState<Partial<Group>>({ name: '', order_num: 0 });
    const [newSite, setNewSite] = useState<Partial<Site>>({ 
        name: '', 
        url: '', 
        icon: '', 
        description: '', 
        notes: '',
        order_num: 0,
        group_id: 0
    });

    useEffect(() => {
        fetchData();
        // 确保初始化时重置排序状态
        setSortMode(SortMode.None);
        setCurrentSortingGroupId(null);
    }, []);

    // 同步HTML的class以保持与现有CSS兼容
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const groupsData = await api.getGroups();

            // 获取每个分组的站点并确保id存在
            const groupsWithSites = await Promise.all(
                groupsData
                    .filter(group => group.id !== undefined) // 过滤掉没有id的分组
                    .map(async group => {
                        const sites = await api.getSites(group.id);
                        return {
                            ...group,
                            id: group.id as number, // 确保id不为undefined
                            sites,
                        } as GroupWithSites;
                    })
            );

            setGroups(groupsWithSites);
        } catch (error) {
            console.error("加载数据失败:", error);
            setError("加载数据失败: " + (error as Error).message);
        } finally {
            setLoading(false);
        }
    };

    // 更新站点
    const handleSiteUpdate = async (updatedSite: Site) => {
        try {
            if (updatedSite.id) {
                await api.updateSite(updatedSite.id, updatedSite);
                await fetchData(); // 重新加载数据
            }
        } catch (error) {
            console.error("更新站点失败:", error);
            setError("更新站点失败: " + (error as Error).message);
        }
    };

    // 删除站点
    const handleSiteDelete = async (siteId: number) => {
        try {
            await api.deleteSite(siteId);
            await fetchData(); // 重新加载数据
        } catch (error) {
            console.error("删除站点失败:", error);
            setError("删除站点失败: " + (error as Error).message);
        }
    };

    // 保存分组排序
    const handleSaveGroupOrder = async () => {
        try {
            console.log("保存分组顺序", groups);
            // 构造需要更新的分组顺序数据
            const groupOrders = groups.map((group, index) => ({
                id: group.id as number, // 断言id为number类型
                order_num: index,
            }));

            // 调用API更新分组顺序
            const result = await api.updateGroupOrder(groupOrders);

            if (result) {
                console.log("分组排序更新成功");
                // 重新获取最新数据
                await fetchData();
            } else {
                throw new Error("分组排序更新失败");
            }

            setSortMode(SortMode.None);
            setCurrentSortingGroupId(null);
        } catch (error) {
            console.error("更新分组排序失败:", error);
            setError("更新分组排序失败: " + (error as Error).message);
        }
    };

    // 保存站点排序
    const handleSaveSiteOrder = async (groupId: number, sites: Site[]) => {
        try {
            console.log("保存站点排序", groupId, sites);

            // 构造需要更新的站点顺序数据
            const siteOrders = sites.map((site, index) => ({
                id: site.id as number,
                order_num: index,
            }));

            // 调用API更新站点顺序
            const result = await api.updateSiteOrder(siteOrders);

            if (result) {
                console.log("站点排序更新成功");
                // 重新获取最新数据
                await fetchData();
            } else {
                throw new Error("站点排序更新失败");
            }

            setSortMode(SortMode.None);
            setCurrentSortingGroupId(null);
        } catch (error) {
            console.error("更新站点排序失败:", error);
            setError("更新站点排序失败: " + (error as Error).message);
        }
    };

    // 启动分组排序
    const startGroupSort = () => {
        console.log("开始分组排序");
        setSortMode(SortMode.GroupSort);
        setCurrentSortingGroupId(null);
    };

    // 启动站点排序
    const startSiteSort = (groupId: number) => {
        console.log("开始站点排序");
        setSortMode(SortMode.SiteSort);
        setCurrentSortingGroupId(groupId);
    };

    // 取消排序
    const cancelSort = () => {
        setSortMode(SortMode.None);
        setCurrentSortingGroupId(null);
    };

    // 处理拖拽结束事件
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over) return;

        if (active.id !== over.id) {
            const oldIndex = groups.findIndex(group => group.id.toString() === active.id);
            const newIndex = groups.findIndex(group => group.id.toString() === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                setGroups(arrayMove(groups, oldIndex, newIndex));
            }
        }
    };

    // 新增分组相关函数
    const handleOpenAddGroup = () => {
        setNewGroup({ name: '', order_num: groups.length });
        setOpenAddGroup(true);
    };

    const handleCloseAddGroup = () => {
        setOpenAddGroup(false);
    };

    const handleGroupInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewGroup({
            ...newGroup,
            [e.target.name]: e.target.value
        });
    };

    const handleCreateGroup = async () => {
        try {
            if (!newGroup.name) {
                setError("分组名称不能为空");
                return;
            }

            await api.createGroup(newGroup as Group);
            await fetchData(); // 重新加载数据
            handleCloseAddGroup();
        } catch (error) {
            console.error("创建分组失败:", error);
            setError("创建分组失败: " + (error as Error).message);
        }
    };

    // 新增站点相关函数
    const handleOpenAddSite = (groupId: number) => {
        const group = groups.find(g => g.id === groupId);
        const maxOrderNum = group?.sites.length ? Math.max(...group.sites.map(s => s.order_num)) + 1 : 0;
        
        setNewSite({
            name: '',
            url: '',
            icon: '',
            description: '',
            notes: '',
            group_id: groupId,
            order_num: maxOrderNum
        });
        
        setOpenAddSite(true);
    };

    const handleCloseAddSite = () => {
        setOpenAddSite(false);
    };

    const handleSiteInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewSite({
            ...newSite,
            [e.target.name]: e.target.value
        });
    };

    const handleCreateSite = async () => {
        try {
            if (!newSite.name || !newSite.url) {
                setError("站点名称和URL不能为空");
                return;
            }

            await api.createSite(newSite as Site);
            await fetchData(); // 重新加载数据
            handleCloseAddSite();
        } catch (error) {
            console.error("创建站点失败:", error);
            setError("创建站点失败: " + (error as Error).message);
        }
    };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box 
                sx={{ 
                    minHeight: '100vh',
                    bgcolor: 'background.default',
                    color: 'text.primary',
                    transition: 'all 0.3s ease-in-out'
                }}
            >
                <Container 
                    maxWidth="lg" 
                    sx={{ 
                        py: 4, 
                        px: { xs: 2, sm: 3, md: 4 } 
                    }}
                >
                    <Box 
                        sx={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            mb: 5
                        }}
                    >
                        <Typography 
                            variant="h3" 
                            component="h1" 
                            fontWeight="bold" 
                            color="text.primary"
                        >
                            导航站
                        </Typography>
                        <Stack direction="row" spacing={2} alignItems="center">
                            {sortMode !== SortMode.None ? (
                                <>
                                    {sortMode === SortMode.GroupSort && (
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            startIcon={<SaveIcon />}
                                            onClick={handleSaveGroupOrder}
                                        >
                                            保存分组顺序
                                        </Button>
                                    )}
                                    <Button
                                        variant="outlined"
                                        color="inherit"
                                        startIcon={<CancelIcon />}
                                        onClick={cancelSort}
                                    >
                                        取消编辑
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button
                                        variant="outlined"
                                        color="primary"
                                        startIcon={<SortIcon />}
                                        onClick={startGroupSort}
                                    >
                                        编辑排序
                                    </Button>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        startIcon={<AddIcon />}
                                        onClick={handleOpenAddGroup}
                                    >
                                        新增分组
                                    </Button>
                                </>
                            )}
                            <ThemeToggle darkMode={darkMode} onToggle={toggleTheme} />
                        </Stack>
                    </Box>

                    {loading && (
                        <Box 
                            sx={{ 
                                display: 'flex', 
                                justifyContent: 'center', 
                                alignItems: 'center', 
                                height: '200px' 
                            }}
                        >
                            <CircularProgress size={60} thickness={4} />
                        </Box>
                    )}

                    {error && (
                        <Alert 
                            severity="error" 
                            variant="outlined"
                            sx={{ mb: 4 }}
                        >
                            <Typography fontWeight="bold" component="span">错误! </Typography>
                            {error}
                        </Alert>
                    )}

                    {!loading && !error && (
                        <Box 
                            sx={{ 
                                '& > *': { mb: 5 },
                                minHeight: '100px'
                            }}
                        >
                            {sortMode === SortMode.GroupSort ? (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                >
                                    <SortableContext
                                        items={groups.map(group => group.id.toString())}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <Stack 
                                            spacing={2} 
                                            sx={{ 
                                                '& > *': { 
                                                    transition: 'none'
                                                }
                                            }}
                                        >
                                            {groups.map(group => (
                                                <SortableGroupItem
                                                    key={group.id}
                                                    id={group.id.toString()}
                                                    group={group}
                                                />
                                            ))}
                                        </Stack>
                                    </SortableContext>
                                </DndContext>
                            ) : (
                                <Stack spacing={5}>
                                    {groups.map(group => (
                                        <GroupCard
                                            key={`group-${group.id}`}
                                            group={group}
                                            sortMode={sortMode === SortMode.None ? "None" : "SiteSort"}
                                            currentSortingGroupId={currentSortingGroupId}
                                            onUpdate={handleSiteUpdate}
                                            onDelete={handleSiteDelete}
                                            onSaveSiteOrder={handleSaveSiteOrder}
                                            onStartSiteSort={startSiteSort}
                                            onAddSite={handleOpenAddSite}
                                        />
                                    ))}
                                </Stack>
                            )}
                        </Box>
                    )}

                    {/* 新增分组对话框 */}
                    <Dialog open={openAddGroup} onClose={handleCloseAddGroup} maxWidth="sm" fullWidth>
                        <DialogTitle>
                            新增分组
                            <IconButton
                                aria-label="close"
                                onClick={handleCloseAddGroup}
                                sx={{
                                    position: 'absolute',
                                    right: 8,
                                    top: 8,
                                }}
                            >
                                <CloseIcon />
                            </IconButton>
                        </DialogTitle>
                        <DialogContent>
                            <DialogContentText sx={{ mb: 2 }}>
                                请输入新分组的信息
                            </DialogContentText>
                            <TextField
                                autoFocus
                                margin="dense"
                                id="group-name"
                                name="name"
                                label="分组名称"
                                type="text"
                                fullWidth
                                variant="outlined"
                                value={newGroup.name}
                                onChange={handleGroupInputChange}
                                sx={{ mb: 2 }}
                            />
                        </DialogContent>
                        <DialogActions sx={{ px: 3, pb: 3 }}>
                            <Button onClick={handleCloseAddGroup} variant="outlined">取消</Button>
                            <Button onClick={handleCreateGroup} variant="contained" color="primary">创建</Button>
                        </DialogActions>
                    </Dialog>

                    {/* 新增站点对话框 */}
                    <Dialog open={openAddSite} onClose={handleCloseAddSite} maxWidth="md" fullWidth>
                        <DialogTitle>
                            新增站点
                            <IconButton
                                aria-label="close"
                                onClick={handleCloseAddSite}
                                sx={{
                                    position: 'absolute',
                                    right: 8,
                                    top: 8,
                                }}
                            >
                                <CloseIcon />
                            </IconButton>
                        </DialogTitle>
                        <DialogContent>
                            <DialogContentText sx={{ mb: 2 }}>
                                请输入新站点的信息
                            </DialogContentText>
                            <Stack spacing={2}>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <Box sx={{ flex: 1 }}>
                                        <TextField
                                            autoFocus
                                            margin="dense"
                                            id="site-name"
                                            name="name"
                                            label="站点名称"
                                            type="text"
                                            fullWidth
                                            variant="outlined"
                                            value={newSite.name}
                                            onChange={handleSiteInputChange}
                                        />
                                    </Box>
                                    <Box sx={{ flex: 1 }}>
                                        <TextField
                                            margin="dense"
                                            id="site-url"
                                            name="url"
                                            label="站点URL"
                                            type="url"
                                            fullWidth
                                            variant="outlined"
                                            value={newSite.url}
                                            onChange={handleSiteInputChange}
                                        />
                                    </Box>
                                </Box>
                                <TextField
                                    margin="dense"
                                    id="site-icon"
                                    name="icon"
                                    label="图标URL"
                                    type="url"
                                    fullWidth
                                    variant="outlined"
                                    value={newSite.icon}
                                    onChange={handleSiteInputChange}
                                />
                                <TextField
                                    margin="dense"
                                    id="site-description"
                                    name="description"
                                    label="站点描述"
                                    type="text"
                                    fullWidth
                                    variant="outlined"
                                    value={newSite.description}
                                    onChange={handleSiteInputChange}
                                />
                                <TextField
                                    margin="dense"
                                    id="site-notes"
                                    name="notes"
                                    label="备注"
                                    type="text"
                                    fullWidth
                                    multiline
                                    rows={2}
                                    variant="outlined"
                                    value={newSite.notes}
                                    onChange={handleSiteInputChange}
                                />
                            </Stack>
                        </DialogContent>
                        <DialogActions sx={{ px: 3, pb: 3 }}>
                            <Button onClick={handleCloseAddSite} variant="outlined">取消</Button>
                            <Button onClick={handleCreateSite} variant="contained" color="primary">创建</Button>
                        </DialogActions>
                    </Dialog>

                    {/* GitHub角标 */}
                    <Box 
                        sx={{ 
                            position: 'fixed', 
                            bottom: 16, 
                            right: 16, 
                            zIndex: 10 
                        }}
                    >
                        <Paper
                            component="a"
                            href="https://github.com/zqq-nuli/Navihive"
                            target="_blank"
                            rel="noopener noreferrer"
                            elevation={2}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                p: 1,
                                borderRadius: 10,
                                bgcolor: 'background.paper',
                                color: 'text.secondary',
                                transition: 'all 0.3s ease-in-out',
                                '&:hover': {
                                    bgcolor: 'action.hover',
                                    color: 'text.primary',
                                    boxShadow: 4
                                },
                                textDecoration: 'none'
                            }}
                        >
                            <GitHubIcon />
                        </Paper>
                    </Box>
                </Container>
            </Box>
        </ThemeProvider>
    );
}

export default App;
