from app.services.script_runner import run_script


class TestSheetStockCalc:
    def test_basic_a4_from_sra3(self):
        result = run_script("sheet_stock_calc", {
            "quantity": 1,
            "width_mm": 450,
            "height_mm": 320,
            "cut_width_mm": 210,
            "cut_height_mm": 297,
        })
        assert result == 0.5

    def test_5_a4_from_sra3(self):
        result = run_script("sheet_stock_calc", {
            "quantity": 5,
            "width_mm": 450,
            "height_mm": 320,
            "cut_width_mm": 210,
            "cut_height_mm": 297,
        })
        assert result == 2.5

    def test_30_a4_from_sra3(self):
        result = run_script("sheet_stock_calc", {
            "quantity": 30,
            "width_mm": 450,
            "height_mm": 320,
            "cut_width_mm": 210,
            "cut_height_mm": 297,
        })
        assert result == 15.0

    def test_a4_from_a4(self):
        result = run_script("sheet_stock_calc", {
            "quantity": 1,
            "width_mm": 297,
            "height_mm": 210,
            "cut_width_mm": 210,
            "cut_height_mm": 297,
        })
        assert result == 1.0

    def test_4_from_one_sheet(self):
        result = run_script("sheet_stock_calc", {
            "quantity": 4,
            "width_mm": 420,
            "height_mm": 594,
            "cut_width_mm": 210,
            "cut_height_mm": 297,
        })
        assert result == 1.0

    def test_missing_dimensions(self):
        result = run_script("sheet_stock_calc", {
            "quantity": 10,
            "width_mm": 0,
            "height_mm": 320,
            "cut_width_mm": 210,
            "cut_height_mm": 297,
        })
        assert result == 0

    def test_cut_larger_than_sheet(self):
        result = run_script("sheet_stock_calc", {
            "quantity": 1,
            "width_mm": 210,
            "height_mm": 297,
            "cut_width_mm": 450,
            "cut_height_mm": 320,
        })
        assert result == 0

    def test_large_quantity(self):
        result = run_script("sheet_stock_calc", {
            "quantity": 1000,
            "width_mm": 450,
            "height_mm": 320,
            "cut_width_mm": 210,
            "cut_height_mm": 297,
        })
        assert result == 500.0

    def test_100_a4_from_sra3(self):
        result = run_script("sheet_stock_calc", {
            "quantity": 100,
            "width_mm": 450,
            "height_mm": 320,
            "cut_width_mm": 210,
            "cut_height_mm": 297,
        })
        assert result == 50.0


class TestRollStockCalc:
    def test_basic_roll(self):
        result = run_script("roll_stock_calc", {
            "quantity": 1,
            "roll_width_m": 3.2,
            "cut_width_mm": 1000,
            "cut_height_mm": 1000,
        })
        assert result > 0

    def test_multiple_pieces(self):
        result = run_script("roll_stock_calc", {
            "quantity": 10,
            "roll_width_m": 3.2,
            "cut_width_mm": 1000,
            "cut_height_mm": 500,
        })
        assert result > 0

    def test_missing_roll_width(self):
        result = run_script("roll_stock_calc", {
            "quantity": 5,
            "roll_width_m": 0,
            "cut_width_mm": 1000,
            "cut_height_mm": 1000,
        })
        assert result == 0

    def test_cut_too_large_both_orientations(self):
        result = run_script("roll_stock_calc", {
            "quantity": 1,
            "roll_width_m": 1.0,
            "cut_width_mm": 1500,
            "cut_height_mm": 1500,
        })
        assert result == 0
