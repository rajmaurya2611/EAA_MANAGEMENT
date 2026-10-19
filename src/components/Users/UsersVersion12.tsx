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
