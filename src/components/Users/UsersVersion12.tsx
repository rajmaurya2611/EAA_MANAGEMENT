// src/components/UsersVersion12.tsx

import React, { useEffect, useState } from "react";
import {
  Table,
  Spin,
  message,
  Select,
  DatePicker,
  Button,
  Input,
} from "antd";
import {
  DownloadOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  getDatabase,
  ref as dbRef,
  onValue,
  off,
  DataSnapshot,
} from "firebase/database";
import CryptoJS from "crypto-js";
import * as XLSX from "xlsx";
import dayjs, { Dayjs } from "dayjs";


import { Card, Row, Col, Typography } from "antd";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";






const { Option } = Select;
const { RangePicker } = DatePicker;

// explicit timestamp format for dayjs parsing
const TS_FMT = "YYYY-MM-DD HH:mm:ss";

const AES_SECRET_KEY = import.meta.env.VITE_AES_SECRET_KEY!;

const decryptAES = (encryptedText: string) => {
  try {
    const cleaned = encryptedText.replace(/\s+/g, "");
    const ciphertextWA = CryptoJS.enc.Base64.parse(cleaned);
    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertextWA });
    const keyWA = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
    const decrypted = CryptoJS.AES.decrypt(cipherParams, keyWA, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const plain = decrypted.toString(CryptoJS.enc.Utf8);
    return plain || encryptedText;
  } catch (err) {
    console.warn(`Skipping decryption for: ${encryptedText}`, err);
    return encryptedText;
  }
};

interface UserData {
  key: string;
  name: string;
  year: string;
  email: string;
  college: string;
  branch: string;
  registrationTime: string;
  registrationDate: string;
}

const UsersVersion12: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  const [collegeFilter, setCollegeFilter] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [searchText, setSearchText] = useState("");

  // NEW: pagination state (user-controllable page size)
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Fetch & decrypt data
  useEffect(() => {
    const db = getDatabase();
    const usersRef = dbRef(db, "version12/users");

    const listener = (snap: DataSnapshot) => {
      const val = snap.val();
      if (!val || typeof val !== "object") {
        setUsers([]);
        setFilteredUsers([]);
        setLoading(false);
        return;
      }

      const arr: UserData[] = Object.entries(val).map(
        ([id, data]) => {
          const u = data as Record<string, string>;
          return {
            key: id,
            name:    decryptAES(u.name         || ""),
            year:    decryptAES(u.year         || ""),
            email:   decryptAES(u.email        || ""),
            college: decryptAES(u.college      || ""),
            branch:  decryptAES(u.branch       || ""),
            // use original uppercase keys:
            registrationTime: u.RegistrationTime || "",
            registrationDate: u.RegistrationDate || "",
          };
        }
      );

      // Sort by combined date+time descending
      const sorted = arr.sort((a, b) => {
        const aTs = dayjs(`${a.registrationDate} ${a.registrationTime}`, TS_FMT).valueOf();
        const bTs = dayjs(`${b.registrationDate} ${b.registrationTime}`, TS_FMT).valueOf();
        return bTs - aTs;
      });

      setUsers(sorted);
      setFilteredUsers(sorted);
      setLoading(false);
      setPage(1); // reset to first page on fresh load
    };

    onValue(usersRef, listener, (err) => {
      console.error(err);
      message.error("Failed to fetch users v12");
      setLoading(false);
    });

    return () => off(usersRef, "value", listener);
  }, []);

  // Re-apply filters on criteria change
  useEffect(() => {
    let res = [...users];

    if (collegeFilter)
      res = res.filter((u) => u.college === collegeFilter);
    if (branchFilter)
      res = res.filter((u) => u.branch === branchFilter);
    if (yearFilter)
      res = res.filter((u) => u.year === yearFilter);

    if (dateRange[0] && dateRange[1]) {
      const [start, end] = dateRange;
      res = res.filter((u) => {
        const d = dayjs(u.registrationDate, "YYYY-MM-DD");
        return (
          d.isAfter(start.startOf("day")) &&
          d.isBefore(end.endOf("day"))
        );
      });
    }

    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      res = res.filter(
        (u) =>
          u.name.toLowerCase().includes(s) ||
          u.email.toLowerCase().includes(s)
      );
    }

    // Sort filtered users based on date+time descending
    const sorted = res.sort((a, b) => {
      const aTs = dayjs(`${a.registrationDate} ${a.registrationTime}`, TS_FMT).valueOf();
      const bTs = dayjs(`${b.registrationDate} ${b.registrationTime}`, TS_FMT).valueOf();
      return bTs - aTs;
    });

    setFilteredUsers(sorted);
    setPage(1); // reset to first page when filters change
  }, [
    collegeFilter,
    branchFilter,
    yearFilter,
    dateRange,
    searchText,
    users,
  ]);

  const exportToCSV = () => {
    const ws = XLSX.utils.json_to_sheet(filteredUsers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "UsersV12");
    XLSX.writeFile(wb, "Users_Version12.csv");
  };

  const resetFilters = () => {
    setCollegeFilter(null);
    setBranchFilter(null);
    setYearFilter(null);
    setDateRange([null, null]);
    setSearchText("");
    setPage(1);
    setPageSize(10); // keep default page size on reset
  };

  const unique = (arr: string[]) =>
    Array.from(new Set(arr)).sort();




// Dashboard analytics — derived from currently filtered users
const totalUsers = filteredUsers.length;

const collegesCovered = new Set(
  filteredUsers
    .map((u) => u.college?.trim())
    .filter((value) => value && value.toLowerCase() !== "unknown")
).size;

const branchesCovered = new Set(
  filteredUsers
    .map((u) => u.branch?.trim())
    .filter((value) => value && value.toLowerCase() !== "unknown")
).size;

// New registrations during the last 30 days, based on all loaded users
const thirtyDaysAgo = dayjs().subtract(29, "day").startOf("day");

const newUsersLast30Days = users.filter((u) => {
  const date = dayjs(u.registrationDate, "YYYY-MM-DD", true);

  return (
    date.isValid() &&
    !date.isBefore(thirtyDaysAgo, "day") &&
    !date.isAfter(dayjs(), "day")
  );
}).length;

// Count registrations by academic year
const yearChartData = Object.entries(
  filteredUsers.reduce<Record<string, number>>((acc, user) => {
    const year = user.year?.trim() || "Unknown";
    acc[year] = (acc[year] || 0) + 1;
    return acc;
  }, {})
)
  .map(([name, users]) => ({ name, users }))
  .sort((a, b) => b.users - a.users);

// Count registrations by branch
const branchChartData = Object.entries(
  filteredUsers.reduce<Record<string, number>>((acc, user) => {
    const branch = user.branch?.trim() || "Unknown";
    acc[branch] = (acc[branch] || 0) + 1;
    return acc;
  }, {})
)
  .map(([name, users]) => ({ name, users }))
  .sort((a, b) => b.users - a.users)
  .slice(0, 10);

// Top 10 colleges by registrations
const collegeChartData = Object.entries(
  filteredUsers.reduce<Record<string, number>>((acc, user) => {
    const college = user.college?.trim() || "Unknown";
    acc[college] = (acc[college] || 0) + 1;
    return acc;
  }, {})
)
  .map(([name, users]) => ({ name, users }))
  .sort((a, b) => b.users - a.users)
  .slice(0, 10);

// Daily registration trend
const registrationTrendData = Object.entries(
  filteredUsers.reduce<Record<string, number>>((acc, user) => {
    const date = dayjs(user.registrationDate, "YYYY-MM-DD", true);

    if (date.isValid()) {
      const day = date.format("YYYY-MM-DD");
      acc[day] = (acc[day] || 0) + 1;
    }

    return acc;
  }, {})
)
  .map(([date, registrations]) => ({
    date,
    label: dayjs(date).format("DD MMM"),
    registrations,
  }))
  .sort((a, b) => a.date.localeCompare(b.date));

// Missing profile information
const incompleteProfiles = filteredUsers.filter(
  (u) =>
    !u.college?.trim() ||
    !u.branch?.trim() ||
    !u.year?.trim()
).length;

const chartColors = [
  "#1677ff",
  "#52c41a",
  "#faad14",
  "#722ed1",
  "#eb2f96",
  "#13c2c2",
  "#fa541c",
  "#2f54eb",
  "#a0d911",
  "#f759ab",
];




  const columns = [
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Year", dataIndex: "year", key: "year" },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "College", dataIndex: "college", key: "college" },
    { title: "Branch", dataIndex: "branch", key: "branch" },
    {
      title: "Registration Time",
      dataIndex: "registrationTime",
      key: "registrationTime",
    },
    {
      title: "Registration Date",
      dataIndex: "registrationDate",
      key: "registrationDate",
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 className="text-xl font-semibold">
          Users Version 12
        </h2>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontWeight: 500 }}>
            Total: {filteredUsers.length}
          </span>
          <Button
            icon={<DownloadOutlined />}
            onClick={exportToCSV}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Input.Search
          placeholder="Search Name or Email"
          value={searchText}
          onChange={(e) =>
            setSearchText(e.target.value)
          }
          allowClear
          style={{ width: 220 }}
        />

        <Select
          placeholder="College"
          value={collegeFilter || undefined}
          allowClear
          onChange={(v) => setCollegeFilter(v)}
          style={{ width: 160 }}
        >
          {unique(users.map((u) => u.college)).map(
            (c) => (
              <Option key={c} value={c}>
                {c}
              </Option>
            )
          )}
        </Select>

        <Select
          placeholder="Branch"
          value={branchFilter || undefined}
          allowClear
          onChange={(v) => setBranchFilter(v)}
          style={{ width: 160 }}
        >
          {unique(users.map((u) => u.branch)).map(
            (b) => (
              <Option key={b} value={b}>
                {b}
              </Option>
            )
          )}
        </Select>

        <Select
          placeholder="Year"
          value={yearFilter || undefined}
          allowClear
          onChange={(v) => setYearFilter(v)}
          style={{ width: 120 }}
        >
          {unique(users.map((u) => u.year)).map((y) => (
            <Option key={y} value={y}>
              {y}
            </Option>
          ))}
        </Select>

        <RangePicker
          value={dateRange}
          onChange={(dates) => setDateRange(dates || [null, null])}
          style={{ width: 300 }}
        />

        <Button
          icon={<ReloadOutlined />}
          onClick={resetFilters}
        />
      </div>


{/* ANALYTICS DASHBOARD */}
<div style={{ marginBottom: 28 }}>
  <Typography.Title level={4}>
    User Analytics
  </Typography.Title>

  <Typography.Paragraph type="secondary">
    Registration insights based on your current filters.
  </Typography.Paragraph>

  {/* KPI CARDS */}
  <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
    <Col xs={24} sm={12} lg={6}>
      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Typography.Text type="secondary">
          Total Users
        </Typography.Text>
        <Typography.Title level={2} style={{ margin: "8px 0 0" }}>
          {totalUsers.toLocaleString()}
        </Typography.Title>
        <Typography.Text type="secondary">
          Matching current filters
        </Typography.Text>
      </Card>
    </Col>

    <Col xs={24} sm={12} lg={6}>
      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Typography.Text type="secondary">
          New Users · 30 Days
        </Typography.Text>
        <Typography.Title level={2} style={{ margin: "8px 0 0", color: "#1677ff" }}>
          {newUsersLast30Days.toLocaleString()}
        </Typography.Title>
        <Typography.Text type="secondary">
          All loaded users
        </Typography.Text>
      </Card>
    </Col>

    <Col xs={24} sm={12} lg={6}>
      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Typography.Text type="secondary">
          Colleges Covered
        </Typography.Text>
        <Typography.Title level={2} style={{ margin: "8px 0 0", color: "#389e0d" }}>
          {collegesCovered.toLocaleString()}
        </Typography.Title>
        <Typography.Text type="secondary">
          Unique colleges
        </Typography.Text>
      </Card>
    </Col>

    <Col xs={24} sm={12} lg={6}>
      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Typography.Text type="secondary">
          Branches Covered
        </Typography.Text>
        <Typography.Title level={2} style={{ margin: "8px 0 0", color: "#722ed1" }}>
          {branchesCovered.toLocaleString()}
        </Typography.Title>
        <Typography.Text type="secondary">
          Unique branches
        </Typography.Text>
      </Card>
    </Col>
  </Row>

  {/* REGISTRATION TREND */}
  <Card
    title="Registration Trend"
    bordered={false}
    style={{ marginBottom: 20, borderRadius: 12 }}
  >
    {registrationTrendData.length === 0 ? (
      <Typography.Text type="secondary">
        No valid registration dates available for the selected filters.
      </Typography.Text>
    ) : (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={registrationTrendData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" minTickGap={20} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="registrations"
            name="Registrations"
            stroke="#1677ff"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    )}
  </Card>

  {/* YEAR + BRANCH CHARTS */}
  <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
    <Col xs={24} lg={12}>
      <Card
        title="Users by Academic Year"
        bordered={false}
        style={{ borderRadius: 12 }}
      >
        {yearChartData.length === 0 ? (
          <Typography.Text type="secondary">
            No year data available.
          </Typography.Text>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={yearChartData}
                dataKey="users"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={95}
                label={({ name, percent }) =>
                  `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                }
              >
                {yearChartData.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={chartColors[index % chartColors.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>
    </Col>

    <Col xs={24} lg={12}>
      <Card
        title="Top 10 Branches"
        bordered={false}
        style={{ borderRadius: 12 }}
      >
        {branchChartData.length === 0 ? (
          <Typography.Text type="secondary">
            No branch data available.
          </Typography.Text>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={branchChartData}
              layout="vertical"
              margin={{ left: 10, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar
                dataKey="users"
                name="Users"
                fill="#722ed1"
                radius={[0, 5, 5, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </Col>
  </Row>

  {/* TOP COLLEGES */}
  <Card
    title="Top 10 Colleges by Registrations"
    bordered={false}
    style={{ marginBottom: 20, borderRadius: 12 }}
  >
    {collegeChartData.length === 0 ? (
      <Typography.Text type="secondary">
        No college data available.
      </Typography.Text>
    ) : (
      <ResponsiveContainer
        width="100%"
        height={Math.max(300, collegeChartData.length * 48)}
      >
        <BarChart
          data={collegeChartData}
          layout="vertical"
          margin={{ left: 20, right: 24 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={180}
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Bar
            dataKey="users"
            name="Registered Users"
            fill="#1677ff"
            radius={[0, 5, 5, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    )}
  </Card>

  {/* PROFILE COMPLETENESS */}
  <Card bordered={false} style={{ borderRadius: 12 }}>
    <Typography.Text type="secondary">
      Incomplete Profiles
    </Typography.Text>
    <Typography.Title level={3} style={{ margin: "8px 0" }}>
      {incompleteProfiles.toLocaleString()}
    </Typography.Title>
    <Typography.Text type="secondary">
      Users missing college, branch, or academic year information.
    </Typography.Text>
  </Card>
</div>




      {/* Table */}
      {loading ? (
        <Spin
          size="large"
          style={{
            display: "block",
            margin: "100px auto",
          }}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={filteredUsers}
          rowKey="key"
          scroll={{ x: true }}
          pagination={{
            current: page,
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      )}
    </div>
  );
};

export default UsersVersion12;
