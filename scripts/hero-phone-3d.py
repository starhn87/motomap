# 평면 폰 목업(측면 포함)에 3D 원근을 입힌다 — 화면이 왼쪽(카피 쪽)을 향해
# 돌아간 yaw: 왼쪽 가장자리는 수축(멀다), 오른쪽은 살짝 확대(가깝다).
# 멀어지는 쪽에 음영을 깔고, 2x 입력을 마지막에 절반으로 줄여 계단을 없앤다.
#   python3 scripts/hero-phone-3d.py <입력 평면 목업(2x)> <출력>
import sys
from PIL import Image, ImageChops


def find_coeffs(dst, src):
    """dst 사각형 -> src 사각형 원근 계수 (8원 연립, 가우스 소거)"""
    a = []
    b = []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        b.append(u)
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b.append(v)
    n = 8
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[pivot] = m[pivot], m[col]
        for r in range(n):
            if r != col and m[r][col] != 0:
                f = m[r][col] / m[col][col]
                for c in range(col, n + 1):
                    m[r][c] -= f * m[col][c]
    return [m[i][n] / m[i][i] for i in range(n)]


def main():
    src_path, out_path = sys.argv[1], sys.argv[2]
    img = Image.open(src_path).convert('RGBA')
    w, h = img.size

    # yaw 원근 — 왼쪽 수축, 오른쪽은 바깥으로 살짝 팽창
    inset_x = round(w * 0.085)
    inset_y = round(h * 0.024)
    out_y = round(h * 0.012)
    cw, ch = w, h + out_y * 2
    dst = [
        (inset_x, out_y + inset_y),
        (w, 0),
        (w, ch),
        (inset_x, out_y + h - inset_y),
    ]
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    persp = img.transform((cw, ch), Image.PERSPECTIVE, find_coeffs(dst, src), Image.BICUBIC)

    # 멀어지는 왼쪽에 음영 — 폰 픽셀에만 (알파 마스크와 곱)
    grad = Image.new('L', (cw, 1))
    span = int(cw * 0.6)
    for x in range(cw):
        v = int(max(0.0, 1 - x / span) * 60) if x < span else 0
        grad.putpixel((x, 0), v)
    grad = grad.resize((cw, ch))
    shade_mask = ImageChops.multiply(grad, persp.split()[3])
    shade = Image.new('RGBA', (cw, ch), (0, 0, 0, 255))
    shade.putalpha(shade_mask)
    persp = Image.alpha_composite(persp, shade)

    # 살짝 기울이기 (시계 방향 — 좌하단 코너가 가장 왼쪽에 오는 방향) 후
    # 절반 크기로 다운샘플 — 왜곡·회전 계단이 사라진다
    tilted = persp.rotate(-8, expand=True, resample=Image.BICUBIC)
    final = tilted.resize((tilted.width // 2, tilted.height // 2), Image.LANCZOS)
    final.save(out_path)


main()
