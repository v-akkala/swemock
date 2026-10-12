// swemock C++ runtime for DSA drivers. Precompiled in the image (swemock.hpp.gch).
// Provides LeetCode-style ListNode/TreeNode, a small JSON value, type-directed conversion,
// and the driver protocol: one JSON input per stdin line, one JSON result per line on fd 3.
#pragma once
#include <bits/stdc++.h>
#include <cxxabi.h>
#include <unistd.h>
using namespace std;

struct ListNode {
    int val;
    ListNode* next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode* next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode* left, TreeNode* right) : val(x), left(left), right(right) {}
};

namespace sw {

inline void require(bool ok, const string& what) {
    if (!ok) throw invalid_argument(what);
}

struct Json {
    enum Kind { Null, Bool, Int, Double, String, Array, Object } kind = Null;
    bool b = false;
    long long i = 0;
    double d = 0;
    string s;
    vector<Json> a;
    vector<pair<string, Json>> o;

    Json() = default;
    static Json array() { Json j; j.kind = Array; return j; }
    static Json boolean(bool v) { Json j; j.kind = Bool; j.b = v; return j; }
    static Json integer(long long v) { Json j; j.kind = Int; j.i = v; return j; }
    static Json number(double v) { Json j; j.kind = Double; j.d = v; return j; }
    static Json string_(string v) { Json j; j.kind = String; j.s = std::move(v); return j; }

    bool is_null() const { return kind == Null; }
    size_t size() const { require(kind == Array, "expected a JSON array"); return a.size(); }
    const Json& operator[](size_t k) const { require(kind == Array && k < a.size(), "array index out of range"); return a[k]; }
    const Json& at(const string& key) const {
        require(kind == Object, "expected a JSON object");
        for (auto& [k, v] : o) if (k == key) return v;
        throw invalid_argument("missing key: " + key);
    }
    const string& str() const { require(kind == String, "expected a JSON string"); return s; }
    void push(Json v) { require(kind == Array, "push on non-array"); a.push_back(std::move(v)); }
};

// ---- parsing ------------------------------------------------------------------

struct Parser {
    const string& t;
    size_t p = 0;
    explicit Parser(const string& text) : t(text) {}

    void ws() { while (p < t.size() && isspace((unsigned char)t[p])) p++; }
    char peek() { ws(); require(p < t.size(), "unexpected end of JSON"); return t[p]; }
    void expect(char c) { require(peek() == c, string("expected '") + c + "'"); p++; }
    bool lit(const char* w) {
        size_t n = strlen(w);
        if (t.compare(p, n, w) == 0) { p += n; return true; }
        return false;
    }

    Json value() {
        char c = peek();
        if (c == '{') return object();
        if (c == '[') return arr();
        if (c == '"') return Json::string_(str());
        if (lit("true")) return Json::boolean(true);
        if (lit("false")) return Json::boolean(false);
        if (lit("null")) return Json();
        return num();
    }

    Json object() {
        Json j; j.kind = Json::Object; expect('{');
        if (peek() == '}') { p++; return j; }
        while (true) {
            string k = str(); expect(':');
            j.o.emplace_back(std::move(k), value());
            if (peek() == ',') { p++; continue; }
            expect('}'); return j;
        }
    }

    Json arr() {
        Json j = Json::array(); expect('[');
        if (peek() == ']') { p++; return j; }
        while (true) {
            j.a.push_back(value());
            if (peek() == ',') { p++; continue; }
            expect(']'); return j;
        }
    }

    static void utf8(string& out, unsigned cp) {
        if (cp < 0x80) out += (char)cp;
        else if (cp < 0x800) { out += (char)(0xC0 | (cp >> 6)); out += (char)(0x80 | (cp & 0x3F)); }
        else if (cp < 0x10000) { out += (char)(0xE0 | (cp >> 12)); out += (char)(0x80 | ((cp >> 6) & 0x3F)); out += (char)(0x80 | (cp & 0x3F)); }
        else { out += (char)(0xF0 | (cp >> 18)); out += (char)(0x80 | ((cp >> 12) & 0x3F)); out += (char)(0x80 | ((cp >> 6) & 0x3F)); out += (char)(0x80 | (cp & 0x3F)); }
    }

    unsigned hex4() {
        require(p + 4 <= t.size(), "bad \\u escape");
        unsigned v = stoul(t.substr(p, 4), nullptr, 16); p += 4; return v;
    }

    string str() {
        expect('"');
        string out;
        while (true) {
            require(p < t.size(), "unterminated string");
            char c = t[p++];
            if (c == '"') return out;
            if (c != '\\') { out += c; continue; }
            char e = t[p++];
            switch (e) {
                case '"': out += '"'; break;
                case '\\': out += '\\'; break;
                case '/': out += '/'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                case 'n': out += '\n'; break;
                case 'r': out += '\r'; break;
                case 't': out += '\t'; break;
                case 'u': {
                    unsigned cp = hex4();
                    if (cp >= 0xD800 && cp < 0xDC00 && lit("\\u")) cp = 0x10000 + ((cp - 0xD800) << 10) + (hex4() - 0xDC00);
                    utf8(out, cp);
                    break;
                }
                default: throw invalid_argument("bad escape");
            }
        }
    }

    Json num() {
        size_t start = p;
        if (t[p] == '-') p++;
        bool frac = false;
        while (p < t.size() && (isdigit((unsigned char)t[p]) || t[p] == '.' || t[p] == 'e' || t[p] == 'E' || t[p] == '+' || t[p] == '-')) {
            if (!isdigit((unsigned char)t[p])) frac = true;
            p++;
        }
        string n = t.substr(start, p - start);
        require(!n.empty() && n != "-", "bad JSON number");
        if (!frac) {
            long long v; auto r = from_chars(n.data(), n.data() + n.size(), v);
            if (r.ec == errc()) return Json::integer(v);
        }
        return Json::number(stod(n));
    }
};

inline Json parse(const string& text) { Parser ps(text); Json v = ps.value(); ps.ws(); require(ps.p == text.size(), "trailing characters"); return v; }

// ---- serialization ------------------------------------------------------------

inline void dump(const Json& j, string& out) {
    switch (j.kind) {
        case Json::Null: out += "null"; break;
        case Json::Bool: out += j.b ? "true" : "false"; break;
        case Json::Int: out += to_string(j.i); break;
        case Json::Double: {
            if (!isfinite(j.d)) { out += "null"; break; }
            char buf[64]; auto r = to_chars(buf, buf + sizeof buf, j.d); out.append(buf, r.ptr); break;
        }
        case Json::String: {
            out += '"';
            for (unsigned char c : j.s) {
                switch (c) {
                    case '"': out += "\\\""; break;
                    case '\\': out += "\\\\"; break;
                    case '\n': out += "\\n"; break;
                    case '\r': out += "\\r"; break;
                    case '\t': out += "\\t"; break;
                    default:
                        if (c < 0x20) { char buf[8]; snprintf(buf, sizeof buf, "\\u%04x", c); out += buf; }
                        else out += (char)c;
                }
            }
            out += '"';
            break;
        }
        case Json::Array: {
            out += '[';
            for (size_t k = 0; k < j.a.size(); k++) { if (k) out += ','; dump(j.a[k], out); }
            out += ']';
            break;
        }
        case Json::Object: {
            out += '{';
            for (size_t k = 0; k < j.o.size(); k++) {
                if (k) out += ',';
                dump(Json::string_(j.o[k].first), out); out += ':'; dump(j.o[k].second, out);
            }
            out += '}';
            break;
        }
    }
}

// ---- conversion: JSON -> C++ ---------------------------------------------------

template <class T> struct From;
template <> struct From<int> { static int get(const Json& j) { require(j.kind == Json::Int, "expected an integer"); return (int)j.i; } };
template <> struct From<long long> { static long long get(const Json& j) { require(j.kind == Json::Int, "expected an integer"); return j.i; } };
template <> struct From<double> {
    static double get(const Json& j) { require(j.kind == Json::Int || j.kind == Json::Double, "expected a number"); return j.kind == Json::Int ? (double)j.i : j.d; }
};
template <> struct From<bool> { static bool get(const Json& j) { require(j.kind == Json::Bool, "expected a boolean"); return j.b; } };
template <> struct From<char> { static char get(const Json& j) { require(j.kind == Json::String && j.s.size() == 1, "expected a 1-character string"); return j.s[0]; } };
template <> struct From<string> { static string get(const Json& j) { return j.str(); } };
template <class T> struct From<vector<T>> {
    static vector<T> get(const Json& j) {
        vector<T> v; v.reserve(j.size());
        for (auto& e : j.a) v.push_back(From<T>::get(e));
        return v;
    }
};
template <> struct From<ListNode*> {
    static ListNode* get(const Json& j) {
        if (j.is_null()) return nullptr;
        ListNode dummy; ListNode* cur = &dummy;
        for (auto& e : j.a) { cur->next = new ListNode(From<int>::get(e)); cur = cur->next; }
        return dummy.next;
    }
};
template <> struct From<TreeNode*> {
    static TreeNode* get(const Json& j) {
        if (j.is_null() || j.size() == 0 || j.a[0].is_null()) return nullptr;
        TreeNode* root = new TreeNode(From<int>::get(j.a[0]));
        vector<TreeNode*> q{root};
        size_t qi = 0, k = 1;
        while (qi < q.size() && k < j.a.size()) {
            TreeNode* n = q[qi++];
            if (!j.a[k].is_null()) { n->left = new TreeNode(From<int>::get(j.a[k])); q.push_back(n->left); }
            k++;
            if (k < j.a.size() && !j.a[k].is_null()) { n->right = new TreeNode(From<int>::get(j.a[k])); q.push_back(n->right); }
            k++;
        }
        return root;
    }
};

template <class T> T from_json(const Json& j) { return From<T>::get(j); }

// ---- conversion: C++ -> JSON ---------------------------------------------------

inline Json to_json(bool v) { return Json::boolean(v); }
inline Json to_json(char v) { return Json::string_(string(1, v)); }
inline Json to_json(int v) { return Json::integer(v); }
inline Json to_json(long v) { return Json::integer(v); }
inline Json to_json(long long v) { return Json::integer(v); }
inline Json to_json(unsigned v) { return Json::integer(v); }
inline Json to_json(unsigned long v) { return Json::integer((long long)v); }
inline Json to_json(unsigned long long v) { return Json::integer((long long)v); }
inline Json to_json(double v) { return Json::number(v); }
inline Json to_json(float v) { return Json::number(v); }
inline Json to_json(const string& v) { return Json::string_(v); }
inline Json to_json(const char* v) { return Json::string_(v); }
inline Json to_json(ListNode* head) {
    Json out = Json::array();
    for (size_t n = 0; head; head = head->next) {
        require(++n <= 10'000'000, "returned linked list has a cycle");
        out.push(Json::integer(head->val));
    }
    return out;
}
inline Json to_json(TreeNode* root) {
    Json out = Json::array();
    if (!root) return out;
    vector<TreeNode*> q{root};
    for (size_t qi = 0; qi < q.size(); qi++) {
        require(q.size() <= 20'000'000, "returned tree is too large or has a cycle");
        TreeNode* n = q[qi];
        if (!n) { out.push(Json()); continue; }
        out.push(Json::integer(n->val));
        q.push_back(n->left);
        q.push_back(n->right);
    }
    while (!out.a.empty() && out.a.back().is_null()) out.a.pop_back();
    return out;
}
template <class T> Json to_json(const vector<T>& v) {
    Json out = Json::array();
    for (auto&& x : v) {
        if constexpr (is_same_v<T, bool>) out.push(to_json(static_cast<bool>(x)));  // vector<bool> proxies
        else out.push(to_json(x));
    }
    return out;
}

// ---- protocol -----------------------------------------------------------------

inline double& elapsed_ms() { static double v = 0; return v; }

template <class F> auto timed(F&& f) {
    auto t0 = chrono::steady_clock::now();
    auto r = f();
    elapsed_ms() += chrono::duration<double, milli>(chrono::steady_clock::now() - t0).count();
    return r;
}

template <class F> void timed_void(F&& f) {
    auto t0 = chrono::steady_clock::now();
    f();
    elapsed_ms() += chrono::duration<double, milli>(chrono::steady_clock::now() - t0).count();
}

inline void reply(const string& line) {
    cout.flush(); cerr.flush(); fflush(stdout); fflush(stderr);
    string s = line + "\n";
    const char* p = s.data(); size_t left = s.size();
    while (left) { ssize_t n = write(3, p, left); if (n <= 0) _exit(3); p += n; left -= n; }
}

inline string err_json(const string& type, const string& message) {
    string out = "{\"ok\":false,\"errorType\":";
    dump(Json::string_(type), out);
    out += ",\"message\":";
    dump(Json::string_(message), out);
    return out + "}";
}

inline string demangle(const char* name) {
    int status = 0;
    char* d = abi::__cxa_demangle(name, nullptr, nullptr, &status);
    string s = status == 0 && d ? d : name;
    free(d);
    return s;
}

inline int serve(const function<Json(const Json&)>& fn) {
    reply("{\"ready\":true}");
    string line;
    while (getline(cin, line)) {
        elapsed_ms() = 0;
        try {
            Json in = parse(line);
            Json out = fn(in);
            string s = "{\"ok\":true,\"output\":";
            dump(out, s);
            s += ",\"timeMs\":" + to_string(elapsed_ms()) + "}";
            reply(s);
        } catch (const bad_alloc&) {
            reply(err_json("std::bad_alloc", "out of memory"));
        } catch (const exception& e) {
            reply(err_json(demangle(typeid(e).name()), e.what()));
        } catch (...) {
            reply(err_json("unknown exception", "a non-std::exception value was thrown"));
        }
    }
    return 0;
}

}  // namespace sw
