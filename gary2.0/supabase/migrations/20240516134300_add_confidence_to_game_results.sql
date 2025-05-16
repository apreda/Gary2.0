-- Create a function to check if a column exists
create or replace function column_exists(table_name text, column_name text)
returns boolean as $$
begin
    return exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
        and table_name = $1
        and column_name = $2
    );
end;
$$ language plpgsql;

-- Create a function to add a float column with a default value
create or replace function add_float_column(table_name text, column_name text, default_value float8)
returns void as $$
begin
    if not column_exists(table_name, column_name) then
        execute format('alter table %I add column %I float8 default %L', 
                     table_name, column_name, default_value);
        execute format('comment on column %I.%I is %L', 
                     table_name, column_name, 'Confidence score for the prediction (0.0 to 1.0)');
    end if;
end;
$$ language plpgsql;

-- Add the confidence column to game_results
select add_float_column('game_results', 'confidence', 1.0);
