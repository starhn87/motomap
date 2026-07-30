# 평면 폰 목업에 3D 느낌을 입힌다 — 화면을 왼쪽(카피 쪽)으로 살짝 돌린
# 원근 변환 + 오른쪽 측면 두께 + 기울기. generate-hero.mjs 가 호출한다.
#   python3 scripts/hero-phone-3d.py <입력 평면 목업> <출력>
import sys
from PIL import Image, ImageDraw


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

    # 왼쪽 가장자리를 안쪽·위아래로 수축 — 화면이 왼쪽을 향해 돌아간 원근
    inset_x, inset_y = 74, 48
    dst = [(inset_x, inset_y), (w, 0), (w, h), (inset_x, h - inset_y)]
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    persp = img.transform((w, h), Image.PERSPECTIVE, find_coeffs(dst, src), Image.BICUBIC)

    # 오른쪽 측면 두께 — 폰 뒤에 깔아 가까운 쪽 옆면이 보이게 한다
    side = 26
    canvas = Image.new('RGBA', (w + side + 4, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle([w - 16, 4, w + side, h - 4], radius=20, fill=(46, 46, 52, 255))
    d.rounded_rectangle([w + side - 3, 40, w + side, h - 40], radius=2, fill=(70, 70, 78, 255))
    canvas.alpha_composite(persp, (0, 0))

    # 살짝 기울이기 (시계 방향 — 좌하단 코너가 가장 왼쪽에 오는 방향)
    out = canvas.rotate(-8, expand=True, resample=Image.BICUBIC)
    out.save(out_path)


main()
