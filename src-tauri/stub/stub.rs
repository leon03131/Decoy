// The decoy process. Discord only recognises a game when its process owns a top-level window,
// so this creates a tool window parked far off-screen: it never shows on screen, taskbar or Alt+Tab.
#![windows_subsystem = "windows"]

use std::ffi::c_void;
use std::ptr::null_mut;

type H = *mut c_void;

#[repr(C)]
struct Wc {
    style: u32,
    proc_: unsafe extern "system" fn(H, u32, usize, isize) -> isize,
    cb: i32,
    cw: i32,
    inst: H,
    icon: H,
    cur: H,
    bg: H,
    menu: *const u16,
    cls: *const u16,
}

#[repr(C)]
struct Msg {
    hwnd: H,
    message: u32,
    w: usize,
    l: isize,
    time: u32,
    x: i32,
    y: i32,
}

#[link(name = "user32")]
extern "system" {
    fn RegisterClassW(c: *const Wc) -> u16;
    fn CreateWindowExW(ex: u32, cls: *const u16, title: *const u16, style: u32, x: i32, y: i32, w: i32, h: i32, p: H, m: H, i: H, a: H) -> H;
    fn ShowWindow(h: H, c: i32) -> i32;
    fn GetMessageW(m: *mut Msg, h: H, a: u32, b: u32) -> i32;
    fn TranslateMessage(m: *const Msg) -> i32;
    fn DispatchMessageW(m: *const Msg) -> isize;
    fn DefWindowProcW(h: H, m: u32, w: usize, l: isize) -> isize;
}

#[link(name = "kernel32")]
extern "system" {
    fn GetModuleHandleW(n: *const u16) -> H;
}

unsafe extern "system" fn wnd_proc(h: H, m: u32, w: usize, l: isize) -> isize {
    DefWindowProcW(h, m, w, l)
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

fn main() {
    unsafe {
        let cls = wide("DecoyWindow");
        let inst = GetModuleHandleW(std::ptr::null());
        RegisterClassW(&Wc {
            style: 0,
            proc_: wnd_proc,
            cb: 0,
            cw: 0,
            inst,
            icon: null_mut(),
            cur: null_mut(),
            bg: 6 as H,
            menu: std::ptr::null(),
            cls: cls.as_ptr(),
        });
        const WS_EX_TOOLWINDOW: u32 = 0x80;
        const WS_OVERLAPPEDWINDOW: u32 = 0x00CF_0000;
        const SW_SHOWNOACTIVATE: i32 = 4;
        let hwnd = CreateWindowExW(WS_EX_TOOLWINDOW, cls.as_ptr(), wide("Decoy").as_ptr(), WS_OVERLAPPEDWINDOW, -32000, -32000, 220, 90, null_mut(), null_mut(), inst, null_mut());
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        let mut msg: Msg = std::mem::zeroed();
        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}
