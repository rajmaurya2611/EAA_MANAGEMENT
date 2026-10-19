import React, { useState, useEffect, useMemo } from 'react';
import {
    Layout,
    Card,
    Table,
    Input,
    Button,
    Modal,
    Form,
    Switch,
    Segmented,
    Dropdown,
    Tag,
    Popconfirm,
    message,
    InputNumber,
    DatePicker,
    Select,
    Space,
    Empty,
    Row,
    Col,
    Checkbox,
    ConfigProvider,
    theme as antdTheme,
} from 'antd';
import type { MenuProps, TableProps } from 'antd';
import {
    PlusOutlined,
    SearchOutlined,
    MoreOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    BulbOutlined,
    BulbFilled,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';

import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, set, update, remove } from 'firebase/database';

// ----------------------------------------------------------------
// CKEditor 5 (npm-only install, no custom online build needed):
//   npm install @ckeditor/ckeditor5-react ckeditor5
// ----------------------------------------------------------------
import { CKEditor } from '@ckeditor/ckeditor5-react';

import {
    ClassicEditor,

    // Core
    Essentials,
    Paragraph,

    // Basic text formatting
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Subscript,
    Superscript,

    // Font
    Font,
    FontSize,
    FontFamily,
    FontColor,
    FontBackgroundColor,

    // Headings
    Heading,

    // Alignment
    Alignment,

    // Lists
    List,
    TodoList,

    // Indentation
    Indent,

    // Links
    Link,
    AutoLink,

    // Images
    Image,
    ImageToolbar,
    ImageStyle,
    ImageInsertViaUrl,

    // Blocks
    BlockQuote,
    HorizontalLine,

    // Tables
    Table as CKEditorTable,
    TableToolbar,

    // Special characters
    SpecialCharacters,

    // Utilities
    RemoveFormat,

    // HTML
    GeneralHtmlSupport,
    SourceEditing,
} from 'ckeditor5';

import 'ckeditor5/ckeditor5.css';

const { Content } = Layout;

// ----------------------------------------------------------------
// DB paths
// ----------------------------------------------------------------
const CAMPAIGNS_PATH = 'version12/advertisements/campaigns';
const PLACEMENTS_PATH = 'version12/advertisements/placements';

// ----------------------------------------------------------------
// Fixed set of ad slots your app exposes. Add/remove entries here
// as new slots are wired up in the app — this is the single source
// of truth for what shows up in the "Placement ID" dropdown.
// ----------------------------------------------------------------
const PLACEMENT_ID_OPTIONS = [
    'interview_top',
    'interview_bottom',
    'homepage_1',
    'homepage_2',
    'homepage_3',   
    'home_banner',
    'notes_top',
    'notes_bottom',
    'quiz_result',
    'material_1',
    'explore_1',
    'explore_2',
    'explore_3',
];

interface Campaign {
    id: string;
    active: boolean;
    advertiserId: string;
    advertiserName: string;
    priority: number;
    startAt: number;
    endAt: number;
    html: string;
    updatedAt: number;
    version: number;
}

interface Placement {
    id: string;
    active: boolean;
    campaignId: string;
}

const sanitizeId = (s: string) =>
    (s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[.#$[\]/\\]/g, '_');

const AdsMainPage: React.FC = () => {
    // ---------------- Theme ----------------
    // Defaults to dark mode; remembers the user's last choice after that.
    const [darkMode, setDarkMode] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const saved = window.localStorage.getItem('adsMainPageTheme');
            if (saved === 'light') return false;
            if (saved === 'dark') return true;
        }
        return true;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('adsMainPageTheme', darkMode ? 'dark' : 'light');
        }
    }, [darkMode]);

    const pageBg = darkMode ? '#0d0f14' : '#f5f6fa';
    const headingColor = darkMode ? '#f0f1f5' : '#111111';
    const mutedText = darkMode ? '#9aa0ac' : '#777777';
    const eyebrowText = darkMode ? '#8a90a0' : '#888888';
    const faintBorder = darkMode ? '#2a2d37' : '#eeeeee';

    // ---------------- Campaigns state ----------------
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(true);
    const [campaignSearch, setCampaignSearch] = useState<string>('');
    const [campaignStatusFilter, setCampaignStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('Active');

    const [showCampaignModal, setShowCampaignModal] = useState<boolean>(false);
    const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
    const [campaignForm] = Form.useForm();
    const [campaignHtml, setCampaignHtml] = useState<string>('');
    const [noExpiry, setNoExpiry] = useState<boolean>(false);

    const [previewHtml, setPreviewHtml] = useState<string | null>(null);

    // ---------------- Placements state ----------------
    const [placements, setPlacements] = useState<Placement[]>([]);
    const [loadingPlacements, setLoadingPlacements] = useState<boolean>(true);

    const [showPlacementModal, setShowPlacementModal] = useState<boolean>(false);
    const [editingPlacementId, setEditingPlacementId] = useState<string | null>(null);
    const [placementForm] = Form.useForm();

    // Hook-based confirm dialog (instead of the static Modal.confirm) so it
    // stacks/z-indexes correctly when triggered from inside the Placement modal.
    const [modalApi, modalContextHolder] = Modal.useModal();

    // ---------------- Listeners ----------------
    useEffect(() => {
        const campaignsRef = dbRef(db, CAMPAIGNS_PATH);
        const unsubscribe = onValue(campaignsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: Campaign[] = Object.keys(data).map((id) => ({
                    id,
                    active: !!data[id].active,
                    advertiserId: data[id].advertiserId || '',
                    advertiserName: data[id].advertiserName || '',
                    priority: data[id].priority ?? 0,
                    startAt: data[id].startAt ?? 0,
                    endAt: data[id].endAt ?? 0,
                    html: data[id].html || '',
                    updatedAt: data[id].updatedAt ?? 0,
                    version: data[id].version ?? 1,
                }));
                list.sort((a, b) => a.priority - b.priority);
                setCampaigns(list);
            } else {
                setCampaigns([]);
            }
            setLoadingCampaigns(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const placementsRef = dbRef(db, PLACEMENTS_PATH);
        const unsubscribe = onValue(placementsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: Placement[] = Object.keys(data).map((id) => ({
                    id,
                    active: !!data[id].active,
                    campaignId: data[id].campaignId || '',
                }));
                setPlacements(list);
            } else {
                setPlacements([]);
            }
            setLoadingPlacements(false);
        });
        return () => unsubscribe();
    }, []);

    // ---------------- Derived data ----------------
    const filteredCampaigns = useMemo(() => {
        return campaigns.filter((c) => {
            const matchesStatus =
                campaignStatusFilter === 'All' ||
                (campaignStatusFilter === 'Active' && c.active) ||
                (campaignStatusFilter === 'Inactive' && !c.active);

            const q = campaignSearch.trim().toLowerCase();
            const matchesSearch =
                !q ||
                c.id.toLowerCase().includes(q) ||
                c.advertiserName.toLowerCase().includes(q) ||
                c.advertiserId.toLowerCase().includes(q);

            return matchesStatus && matchesSearch;
        });
    }, [campaigns, campaignStatusFilter, campaignSearch]);

    const campaignById = useMemo(() => {
        const map: Record<string, Campaign> = {};
        campaigns.forEach((c) => (map[c.id] = c));
        return map;
    }, [campaigns]);

    const placementById = useMemo(() => {
        const map: Record<string, Placement> = {};
        placements.forEach((p) => (map[p.id] = p));
        return map;
    }, [placements]);

    const placementIdOptions = useMemo(() => {
        const options = PLACEMENT_ID_OPTIONS.map((id) => ({ value: id, label: id }));
        // If editing a placement whose ID predates this fixed list, keep it selectable.
        if (editingPlacementId && !PLACEMENT_ID_OPTIONS.includes(editingPlacementId)) {
            options.unshift({ value: editingPlacementId, label: editingPlacementId });
        }
        return options;
    }, [editingPlacementId]);

    // ---------------- Campaign handlers ----------------
    const openNewCampaignModal = () => {
        setEditingCampaignId(null);
        campaignForm.resetFields();
        setCampaignHtml('');
        setNoExpiry(false);
        campaignForm.setFieldsValue({ active: true, priority: campaigns.length + 1 });
        setShowCampaignModal(true);
    };

    const openEditCampaignModal = (campaign: Campaign) => {
        setEditingCampaignId(campaign.id);
        setCampaignHtml(campaign.html);
        setNoExpiry(!campaign.endAt);
        campaignForm.setFieldsValue({
            campaignId: campaign.id,
            advertiserId: campaign.advertiserId,
            advertiserName: campaign.advertiserName,
            priority: campaign.priority,
            startAt: campaign.startAt ? dayjs(campaign.startAt) : undefined,
            endAt: campaign.endAt ? dayjs(campaign.endAt) : undefined,
            noExpiry: !campaign.endAt,
            html: campaign.html,
            active: campaign.active,
        });
        setShowCampaignModal(true);
    };

    const handleCampaignModalCancel = () => {
        setShowCampaignModal(false);
        setEditingCampaignId(null);
        setCampaignHtml('');
        setNoExpiry(false);
        campaignForm.resetFields();
    };

    const onFinishCampaign = async (values: any) => {
        const { campaignId, advertiserId, advertiserName, priority, startAt, endAt } = values;

        const id = editingCampaignId || sanitizeId(campaignId);
        if (!id) {
            message.error('Please enter a valid campaign ID.');
            return;
        }
        if (!editingCampaignId && campaignById[id]) {
            message.error('A campaign with this ID already exists.');
            return;
        }
        if (!campaignHtml.trim()) {
            message.error('Please add the ad creative HTML.');
            return;
        }

        const data: Campaign = {
            id,
            active: !!values.active,
            advertiserId: advertiserId || '',
            advertiserName: advertiserName || '',
            priority: priority ?? 0,
            startAt: startAt ? (startAt as Dayjs).valueOf() : 0,
            endAt: !noExpiry && endAt ? (endAt as Dayjs).valueOf() : 0,
            html: campaignHtml,
            updatedAt: Date.now(),
            version: editingCampaignId ? (campaignById[id]?.version || 1) + 1 : 1,
        };

        try {
            await set(dbRef(db, `${CAMPAIGNS_PATH}/${id}`), data);
            message.success(editingCampaignId ? 'Campaign updated.' : 'Campaign created.');
            handleCampaignModalCancel();
        } catch (error) {
            console.error(error);
            message.error('Failed to save campaign.');
        }
    };

    const toggleCampaignActive = async (campaign: Campaign, checked: boolean) => {
        try {
            await update(dbRef(db, `${CAMPAIGNS_PATH}/${campaign.id}`), {
                active: checked,
                updatedAt: Date.now(),
            });
        } catch (error) {
            console.error(error);
            message.error('Failed to update campaign status.');
        }
    };

    const deleteCampaign = async (campaign: Campaign) => {
        try {
            await remove(dbRef(db, `${CAMPAIGNS_PATH}/${campaign.id}`));
            message.success('Campaign deleted.');
        } catch (error) {
            console.error(error);
            message.error('Failed to delete campaign.');
        }
    };

    const campaignActionMenu = (campaign: Campaign): MenuProps['items'] => [
        {
            key: 'preview',
            icon: <EyeOutlined />,
            label: 'Preview ad',
            onClick: () => setPreviewHtml(campaign.html),
        },
        {
            key: 'edit',
            icon: <EditOutlined />,
            label: 'Edit',
            onClick: () => openEditCampaignModal(campaign),
        },
        {
            key: 'delete',
            icon: <DeleteOutlined />,
            danger: true,
            label: (
                <Popconfirm
                    title="Delete this campaign?"
                    description="Any placements pointing to it will stop serving ads."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => deleteCampaign(campaign)}
                >
                    <span>Delete</span>
                </Popconfirm>
            ),
        },
    ];

    const campaignColumns: TableProps<Campaign>['columns'] = [
        {
            title: 'Campaign ID',
            dataIndex: 'id',
            key: 'id',
            render: (id: string) => <code style={{ color: '#2f54eb' }}>{id}</code>,
        },
        {
            title: 'Advertiser',
            dataIndex: 'advertiserName',
            key: 'advertiserName',
            render: (name: string) => name || <span style={{ color: mutedText }}>—</span>,
        },
        {
            title: 'Priority',
            dataIndex: 'priority',
            key: 'priority',
            sorter: (a, b) => a.priority - b.priority,
        },
        {
            title: 'Start',
            dataIndex: 'startAt',
            key: 'startAt',
            render: (ts: number) => (ts ? dayjs(ts).format('YYYY-MM-DD') : <span style={{ color: mutedText }}>—</span>),
        },
        {
            title: 'End',
            dataIndex: 'endAt',
            key: 'endAt',
            render: (ts: number) => (ts ? dayjs(ts).format('YYYY-MM-DD') : <span style={{ color: mutedText }}>—</span>),
        },
        {
            title: 'Active',
            dataIndex: 'active',
            key: 'active',
            align: 'center',
            render: (active: boolean, record) => (
                <Switch checked={active} onChange={(checked) => toggleCampaignActive(record, checked)} />
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            width: 70,
            render: (_, record) => (
                <Dropdown menu={{ items: campaignActionMenu(record) }} trigger={['click']}>
                    <Button type="text" icon={<MoreOutlined />} />
                </Dropdown>
            ),
        },
    ];

    // ---------------- Placement handlers ----------------
    const openNewPlacementModal = () => {
        setEditingPlacementId(null);
        placementForm.resetFields();
        placementForm.setFieldsValue({ active: true });
        setShowPlacementModal(true);
    };

    const openEditPlacementModal = (placement: Placement) => {
        setEditingPlacementId(placement.id);
        placementForm.setFieldsValue({
            placementId: placement.id,
            campaignId: placement.campaignId,
            active: placement.active,
        });
        setShowPlacementModal(true);
    };

    const handlePlacementModalCancel = () => {
        setShowPlacementModal(false);
        setEditingPlacementId(null);
        placementForm.resetFields();
    };

    const savePlacement = async (id: string, data: Placement) => {
        try {
            await set(dbRef(db, `${PLACEMENTS_PATH}/${id}`), data);
            message.success(editingPlacementId ? 'Placement updated.' : 'Placement created.');
            handlePlacementModalCancel();
        } catch (error) {
            console.error(error);
            message.error('Failed to save placement.');
        }
    };

    const onFinishPlacement = async (values: any) => {
        const { placementId, campaignId, active } = values;
        const id = editingPlacementId || sanitizeId(placementId);

        if (!id) {
            message.error('Please enter a valid placement ID.');
            return;
        }
        if (!campaignId) {
            message.error('Please select a campaign.');
            return;
        }

        const data: Placement = { id, active: !!active, campaignId };

        // If this placement slot already has a DIFFERENT campaign actively running on it,
        // confirm before overwriting the mapping instead of silently replacing it.
        const existing = placementById[id];
        const isRemapping = existing && existing.campaignId && existing.campaignId !== campaignId;

        if (existing && existing.active && isRemapping) {
            const existingCampaign = campaignById[existing.campaignId];
            const newCampaign = campaignById[campaignId];

            modalApi.confirm({
                title: 'Overwrite active placement?',
                content: (
                    <div>
                        <p style={{ marginBottom: 4 }}>
                            Placement <code>{id}</code> currently has an <strong>active</strong> campaign running:
                        </p>
                        <p style={{ marginBottom: 12 }}>
                            <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                                {existing.campaignId}
                            </Tag>
                            {existingCampaign?.advertiserName ? ` — ${existingCampaign.advertiserName}` : ''}
                        </p>
                        <p>
                            Saving will replace it with{' '}
                            <Tag color="green" style={{ fontFamily: 'monospace' }}>
                                {campaignId}
                            </Tag>
                            {newCampaign?.advertiserName ? ` — ${newCampaign.advertiserName}` : ''} immediately.
                        </p>
                    </div>
                ),
                okText: 'Overwrite',
                okButtonProps: { danger: true },
                cancelText: 'Cancel',
                onOk: () => savePlacement(id, data),
            });
            return;
        }

        await savePlacement(id, data);
    };

    const togglePlacementActive = async (placement: Placement, checked: boolean) => {
        try {
            await update(dbRef(db, `${PLACEMENTS_PATH}/${placement.id}`), { active: checked });
        } catch (error) {
            console.error(error);
            message.error('Failed to update placement status.');
        }
    };

    const deletePlacement = async (placement: Placement) => {
        try {
            await remove(dbRef(db, `${PLACEMENTS_PATH}/${placement.id}`));
            message.success('Placement deleted.');
        } catch (error) {
            console.error(error);
            message.error('Failed to delete placement.');
        }
    };

    const placementColumns: TableProps<Placement>['columns'] = [
        {
            title: 'Placement ID',
            dataIndex: 'id',
            key: 'id',
            render: (id: string) => <code style={{ color: '#2f54eb' }}>{id}</code>,
        },
        {
            title: 'Campaign',
            dataIndex: 'campaignId',
            key: 'campaignId',
            render: (campaignId: string) => {
                const campaign = campaignById[campaignId];
                return (
                    <Space>
                        <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                            {campaignId}
                        </Tag>
                        <span style={{ color: mutedText }}>{campaign?.advertiserName || ''}</span>
                    </Space>
                );
            },
        },
        {
            title: 'Status',
            dataIndex: 'active',
            key: 'active',
            align: 'center',
            render: (active: boolean, record) => (
                <Switch checked={active} onChange={(checked) => togglePlacementActive(record, checked)} />
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            width: 90,
            render: (_, record) => (
                <Space>
                    <Button type="text" icon={<EditOutlined />} onClick={() => openEditPlacementModal(record)} />
                    <Popconfirm
                        title="Delete this placement?"
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => deletePlacement(record)}
                    >
                        <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <ConfigProvider
            theme={{
                algorithm: darkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
                token: { colorPrimary: '#2f54eb', borderRadius: 8 },
            }}
        >
            <Layout style={{ minHeight: '100vh', background: pageBg }}>
                {modalContextHolder}
                <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
                    {/* Page header */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: 24,
                        }}
                    >
                        <div>
                            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: headingColor }}>
                                Advertisement Manager
                            </h1>
                            <p style={{ margin: '4px 0 0', color: mutedText }}>
                                Manage campaigns and placements for Engineers At AKTU
                            </p>
                        </div>

                        <Space size={16} align="center">
                            <Space size={8} align="center">
                                {darkMode ? (
                                    <BulbFilled style={{ color: '#f5c542' }} />
                                ) : (
                                    <BulbOutlined style={{ color: mutedText }} />
                                )}
                                <Switch
                                    checked={darkMode}
                                    onChange={setDarkMode}
                                    checkedChildren="Dark"
                                    unCheckedChildren="Light"
                                />
                            </Space>
                            <Button type="primary" icon={<PlusOutlined />} onClick={openNewCampaignModal}>
                                New Campaign
                            </Button>
                        </Space>
                    </div>

                    {/* Campaigns */}
                    <Card
                        style={{ marginBottom: 24, borderRadius: 12 }}
                        title={<span style={{ letterSpacing: 0.5, fontSize: 12, color: eyebrowText }}>CAMPAIGNS</span>}
                        extra={
                            <Space>
                                <Input
                                    placeholder="Search campaigns..."
                                    prefix={<SearchOutlined />}
                                    value={campaignSearch}
                                    onChange={(e) => setCampaignSearch(e.target.value)}
                                    style={{ width: 240 }}
                                    allowClear
                                />
                                <Segmented
                                    value={campaignStatusFilter}
                                    onChange={(v) => setCampaignStatusFilter(v as 'All' | 'Active' | 'Inactive')}
                                    options={['All', 'Active', 'Inactive']}
                                />
                            </Space>
                        }
                    >
                        <Table
                            rowKey="id"
                            loading={loadingCampaigns}
                            columns={campaignColumns}
                            dataSource={filteredCampaigns}
                            pagination={false}
                            locale={{ emptyText: <Empty description="No campaigns yet" /> }}
                        />
                    </Card>

                    {/* Placements */}
                    <Card
                        style={{ borderRadius: 12 }}
                        title={<span style={{ letterSpacing: 0.5, fontSize: 12, color: eyebrowText }}>PLACEMENTS</span>}
                        extra={
                            <Button icon={<PlusOutlined />} onClick={openNewPlacementModal}>
                                New Placement
                            </Button>
                        }
                    >
                        <Table
                            rowKey="id"
                            loading={loadingPlacements}
                            columns={placementColumns}
                            dataSource={placements}
                            pagination={false}
                            locale={{ emptyText: <Empty description="No placements yet" /> }}
                        />
                    </Card>
                </Content>

                {/* Campaign create/edit modal */}
                <Modal
                        open={showCampaignModal}
                        title={editingCampaignId ? 'Edit Campaign' : 'Create Campaign'}
                        onCancel={handleCampaignModalCancel}
                        footer={null}
                        destroyOnClose
                        centered
                        width="calc(100vw - 32px)"
                        className="campaign-modal"
                        styles={{
                            content: {
                                height: 'calc(100vh - 32px)',
                                maxHeight: 'calc(100vh - 32px)',
                                padding: 0,
                                display: 'flex',
                                flexDirection: 'column',
                            },
                            header: {
                                flexShrink: 0,
                                margin: 0,
                                padding: '16px 24px',
                            },
                            body: {
                                flex: 1,
                                minHeight: 0,
                                padding: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                            },
                        }}
                    >
                    <Form
                        form={campaignForm}
                        layout="vertical"
                        onFinish={onFinishCampaign}
                        initialValues={{ active: true }}
                        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
                    >
                        {/* Scrollable form content */}
                        <div
                            style={{
                                flex: 1,
                                minHeight: 0,
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                padding: 24,
                            }}
                        >
                        {/* Campaign Details */}
                        <Card
                            title={<span style={{ fontSize: 15, fontWeight: 600 }}>Campaign Details</span>}
                            style={{ borderRadius: 10, marginBottom: 16 }}
                        >
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        label="Campaign ID"
                                        name="campaignId"
                                        rules={[{ required: true, message: 'Please enter a campaign ID' }]}
                                    >
                                        <Input placeholder="e.g. CAM-2023-XYZ" disabled={!!editingCampaignId} />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        label="Advertiser ID"
                                        name="advertiserId"
                                        rules={[{ required: true, message: 'Please enter the advertiser ID' }]}
                                    >
                                        <Input placeholder="e.g. ADV-789" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item
                                label="Advertiser Name"
                                name="advertiserName"
                                rules={[{ required: true, message: 'Please enter the advertiser name' }]}
                            >
                                <Input placeholder="Enter advertiser name" />
                            </Form.Item>

                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item
                                        label="Priority"
                                        name="priority"
                                        rules={[{ required: true, message: 'Please enter a priority' }]}
                                    >
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item label="Start At" name="startAt">
                                        <DatePicker
                                            showTime={{ format: 'HH:mm' }}
                                            format="DD-MM-YYYY HH:mm"
                                            style={{ width: '100%' }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item label="End At" name="endAt">
                                        <DatePicker
                                            showTime={{ format: 'HH:mm' }}
                                            format="DD-MM-YYYY HH:mm"
                                            style={{ width: '100%' }}
                                            disabled={noExpiry}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Space size={24}>
                                <Form.Item name="noExpiry" valuePropName="checked" noStyle>
                                    <Checkbox
                                        checked={noExpiry}
                                        onChange={(e) => {
                                            setNoExpiry(e.target.checked);
                                            if (e.target.checked) campaignForm.setFieldsValue({ endAt: undefined });
                                        }}
                                    >
                                        No Expiry
                                    </Checkbox>
                                </Form.Item>
                                <Space>
                                    <span>Active</span>
                                    <Form.Item name="active" valuePropName="checked" noStyle>
                                        <Switch />
                                    </Form.Item>
                                </Space>
                            </Space>
                        </Card>

                        {/* Content + Live Preview */}
                        <Row gutter={16} wrap={false}>
                            <Col flex="auto">
                                <Card
                                    title={<span style={{ fontSize: 15, fontWeight: 600 }}>Campaign Content (HTML)</span>}
                                    style={{ borderRadius: 10, height: '100%' }}
                                    styles={{ body: { padding: 0 } }}
                                >
                                    <div style={{ padding: 12 }}>
                                        <CKEditor
                                            key={editingCampaignId || 'new-campaign'}
                                            editor={ClassicEditor}
                                            data={campaignHtml}
                                            config={{
                                                licenseKey: 'GPL',

                                                plugins: [
                                                    // Core
                                                    Essentials,
                                                    Paragraph,

                                                    // Text formatting
                                                    Bold,
                                                    Italic,
                                                    Underline,
                                                    Strikethrough,
                                                    Subscript,
                                                    Superscript,

                                                    // Font
                                                    Font,
                                                    FontSize,
                                                    FontFamily,
                                                    FontColor,
                                                    FontBackgroundColor,

                                                    // Headings
                                                    Heading,

                                                    // Alignment
                                                    Alignment,

                                                    // Lists
                                                    List,
                                                    TodoList,

                                                    // Indentation
                                                    Indent,

                                                    // Links
                                                    Link,
                                                    AutoLink,

                                                    // Images
                                                    Image,
                                                    ImageToolbar,
                                                    ImageStyle,
                                                    ImageInsertViaUrl,

                                                    // Blocks
                                                    BlockQuote,
                                                    HorizontalLine,

                                                    // Tables
                                                    CKEditorTable,
                                                    TableToolbar,

                                                    // Special characters
                                                    SpecialCharacters,

                                                    // Utilities
                                                    RemoveFormat,

                                                    // HTML
                                                    GeneralHtmlSupport,
                                                    SourceEditing,
                                                ],

                                                toolbar: [
                                                    'heading',
                                                    '|',

                                                    'fontFamily',
                                                    'fontSize',
                                                    'fontColor',
                                                    'fontBackgroundColor',
                                                    '|',

                                                    'bold',
                                                    'italic',
                                                    'underline',
                                                    'strikethrough',
                                                    '|',

                                                    'alignment',
                                                    '|',

                                                    'bulletedList',
                                                    'numberedList',
                                                    'todoList',
                                                    '|',

                                                    'outdent',
                                                    'indent',
                                                    '|',

                                                    'link',
                                                    'insertImage',
                                                    'insertTable',
                                                    '|',

                                                    'blockQuote',
                                                    'horizontalLine',
                                                    '|',

                                                    'specialCharacters',
                                                    'removeFormat',
                                                    '|',

                                                    'sourceEditing',
                                                ],


                                                htmlSupport: {
                                                    allow: [{ name: /.*/, attributes: true, classes: true, styles: true }],
                                                },
                                            }}
                                            onChange={(_event, editor) => {
                                                const data = editor.getData();
                                                setCampaignHtml(data);
                                            }}
                                        />
                                    </div>
                                </Card>
                            </Col>

                            <Col flex="0 0 390px" style={{ width: 390 }}>
                                <Card
                                    title={<span style={{ fontSize: 15, fontWeight: 600, color: '#2f54eb' }}>Live Preview</span>}
                                    style={{ borderRadius: 10, height: '100%' }}
                                >
                                    {/* Mock app frame so the ad slot is seen in context */}
                                    <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
                                        <div
                                            style={{
                                                background: '#2f54eb',
                                                color: '#fff',
                                                padding: '8px 12px',
                                                fontSize: 13,
                                                fontWeight: 600,
                                            }}
                                        >
                                            ☰ App Demo
                                        </div>
                                        <div style={{ padding: 12, background: '#fff' }}>
                                            <div style={{ height: 56, background: '#eef0fa', borderRadius: 6, marginBottom: 10 }} />
                                            <div style={{ height: 70, background: '#eef0fa', borderRadius: 6, marginBottom: 14 }} />

                                            <div style={{ fontSize: 11, color: '#2f54eb', marginBottom: 6 }}>Ad Slot</div>
                                            <div
                                                style={{
                                                    border: '1px dashed #94a3fb',
                                                    borderRadius: 8,
                                                    padding: 4,
                                                    background: '#fafbff',
                                                }}
                                            >
                                                <iframe
                                                    title="campaign-live-preview"
                                                    srcDoc={campaignHtml || '<div style="padding:24px;text-align:center;color:#aaa;font-family:sans-serif;font-size:13px;">Nothing to preview yet</div>'}
                                                    style={{ width: '100%', height: 150, border: 'none' }}
                                                    sandbox=""
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                        </Row>
                        </div>

                        {/* Fixed footer — stays put while the section above scrolls */}
                        <div
                            style={{
                                flexShrink: 0,
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: 10,
                                padding: '12px 24px',
                                borderTop: `1px solid ${faintBorder}`,
                            }}
                        >
                            <Button onClick={handleCampaignModalCancel}>Cancel</Button>
                            <Button type="primary" htmlType="submit">
                                {editingCampaignId ? 'Save Changes' : 'Save Campaign'}
                            </Button>
                        </div>
                    </Form>
                </Modal>

                {/* Placement create/edit modal */}
                <Modal
                    open={showPlacementModal}
                    title={editingPlacementId ? 'Edit Placement' : 'New Placement'}
                    onCancel={handlePlacementModalCancel}
                    footer={null}
                    destroyOnClose
                >
                    <Form form={placementForm} layout="vertical" onFinish={onFinishPlacement}>
                        <Form.Item
                            label="Placement ID"
                            name="placementId"
                            rules={[{ required: true, message: 'Please select a placement slot' }]}
                        >
                            <Select
                                placeholder="Select a placement slot"
                                options={placementIdOptions}
                                disabled={!!editingPlacementId}
                                showSearch
                            />
                        </Form.Item>

                        <Form.Item
                            label="Campaign"
                            name="campaignId"
                            rules={[{ required: true, message: 'Please select a campaign' }]}
                        >
                            <Select
                                placeholder="Select a campaign"
                                options={campaigns.map((c) => ({
                                    value: c.id,
                                    label: `${c.id} — ${c.advertiserName}`,
                                }))}
                            />
                        </Form.Item>

                        <Form.Item label="Active" name="active" valuePropName="checked">
                            <Switch />
                        </Form.Item>

                        <Form.Item>
                            <Button type="primary" htmlType="submit">
                                {editingPlacementId ? 'Save Changes' : 'Create Placement'}
                            </Button>
                            <Button onClick={handlePlacementModalCancel} style={{ marginLeft: 10 }}>
                                Cancel
                            </Button>
                        </Form.Item>
                    </Form>
                </Modal>

                {/* Ad HTML preview */}
                <Modal
                    open={!!previewHtml}
                    title="Ad Preview"
                    onCancel={() => setPreviewHtml(null)}
                    footer={null}
                    width={480}
                >
                    <iframe
                        title="ad-preview"
                        srcDoc={previewHtml || ''}
                        style={{ width: '100%', height: 260, border: `1px solid ${faintBorder}`, borderRadius: 8 }}
                    />
                </Modal>
            </Layout>
        </ConfigProvider>
    );
};

export default AdsMainPage;