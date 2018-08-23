(function(factory) {
        "use strict";
        if (typeof define === 'function' && define.amd) {
            define(['jquery'], factory);
        } else if (window.jQuery && !window.jQuery.fn.TreeFromJson) {
            factory(window.jQuery);
        }
    }
    (function($) {
        'use strict';

        var TreeFromJson = function(container, data, options) {
            this.container = container;
            this._default_options = {
                margin: {top: 20, right: 20, bottom: 20, left: 20},
                width: container.width() > 800 ? container.width()/2 : 800,
                height: container.height() > 800 ? container.height()/2 : 800,
                treeNodes : {
                    width: 3,
                    depth: 5
                },
                maxCharDisplay: 20,
                itemColors: ['#337ab7', '#5cb85c', '#d9534f', '#f0ad4e', '#d9edf7', '#dff0d8', '#f2dede', '#fcf8e3'],
                duration: 500,
                interaction: true,
                default_function: '    return value;',
                toBeMapped: []
            };
            this.options = $.extend({}, this._default_options, options);

            this.data = data;
            this.treeData = [this.create_tree(data, '', this.options.treeNodes.depth, this.options.treeNodes.depth, this.options.treeNodes.width)];

            this.letterWidth = 8;
            this.treeDiv = $('<div class="treeDiv panel panel-default panel-body"></div>');
            this.container.append(
                $('<div></div>').append(this.treeDiv)
            );
            this.width = this.options.width - this.options.margin.right - this.options.margin.left,
            this.height = this.options.height - this.options.margin.top - this.options.margin.bottom;

            this.itemColors = new Map();
            this.mappingDomTable;
            this.currentPicking;
            this.currentPickingCell;

            this.i = 0
            this.root;
            
            this.tree = d3.layout.tree()
                    .size([this.height, this.width]);
            
            this.diagonal = d3.svg.diagonal()
                    .projection(function(d) { return [d.y, d.x]; });
            
            this.svg = d3.select(this.treeDiv[0]).append("svg")
                    .attr("width", this.width + this.options.margin.right + this.options.margin.left)
                    .attr("height", this.height + this.options.margin.top + this.options.margin.bottom)
                .append("g")
                    .attr("transform", "translate(" + this.options.margin.left + "," + this.options.margin.top + ")");
            
            this.root = this.treeData[0];
            this.root.x0 = this.height / 2;
            this.root.y0 = 0;

            if (this.options.toBeMapped.length > 0 ) {
                this.instructions = {};
                var that = this;
                this.options.toBeMapped.forEach(function(item, index) {
                    that.instructions[item] = [];
                    that.itemColors.set(item, that.options.itemColors[index]);
                });

                // draw mapping table
                this.draw_mapping_table();
                this.set_current_mapping_item();
            }

            this.jsonDivIn = $('<div class="jsonDiv panel panel-default panel-body"></div>');
            this.treeDiv.append(this.jsonDivIn);
            var j = this.syntaxHighlightJson(this.data);
            this.jsonDivIn.html(j);
            if (this.options.interaction) {
                this.treeDivResult = $('<div class="resultTree"></div>');
                this.jsonDivOut = $('<div class="jsonDiv"></div>');
                this.treeDivResult.append(this.jsonDivOut);
                this.container.children().append(
                    this.treeDivResult
                );
                this.update_result_tree();
            }

            this.update(this.root);
        }

        TreeFromJson.prototype = {
            constructor: TreeFromJson,

            update: function(source) {
                var that = this;

                // Compute the new tree layout.
                var nodes = this.tree.nodes(this.root).reverse(),
                    links = this.tree.links(nodes);

                // Compute depth size based on the link name
                var maxSizePerDepth = [];
                nodes.forEach(function(d) {
                    let m = maxSizePerDepth[d.depth] !== undefined ? maxSizePerDepth[d.depth] : 0;
                    let text = that.adjust_text_length(d.linkname).length;
                    let size = d.linkname !== undefined ? text : 0;
                    maxSizePerDepth[d.depth] = size > m ? size : m;
                });
                // add previous level together
                for (var i=1; i<maxSizePerDepth.length; i++) {
                    maxSizePerDepth[i] += maxSizePerDepth[i-1];
                }

                // Normalize for fixed-depth. (+ consider linkname)
                //nodes.forEach(function(d) { d.y = d.depth * 100; });
                nodes.forEach(function(d) { 
                    let offset = maxSizePerDepth[d.depth]*(that.options.maxCharDisplay-2);
                    d.y = d.depth * 100 + offset;
                });

                // Update the nodes…
                var node = this.svg.selectAll("g.node")
                        .data(nodes, function(d) { return d.id || (d.id = ++that.i); });

                // Enter any new nodes at the parent's previous 
                var nodeEnter = node.enter().append("g")
                    .attr("class", "node")
                    .attr("transform", function(d) { return "translate(" + source.y0 + "," + source.x0 + ")"; });
                if (this.options.interaction) {
                    nodeEnter.filter(function(d) {
                        return d.additionalNode === undefined || !d.additionalNode;
                    })
                    .on("click", function(d, i) { that.click(d, i, this); });
                } else {
                    nodeEnter.attr("class", "node nodeNoInteraction");
                }

                nodeEnter.filter(function(d) {
		    return d.additionalNode === undefined || !d.additionalNode;
		})
		    .append("circle")
                    .attr("r", 1e-6)
                    .style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

                nodeEnter.append("text")
                    .attr("x", function(d) { return d.children || d._children ? -13 : 13; })
                    .attr("dy", ".35em")
                    .attr("text-anchor", function(d) { return d.children || d._children ? "end" : "start"; })
                    .text(function(d) { return d.name; })
                    .style("fill-opacity", 1e-6);


                // Transition nodes to their new position.
                var nodeUpdate = node.transition()
                    .duration(this.options.duration)
                    .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

                nodeUpdate.select("circle")
                    .attr("r", 10)
                    .style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

                nodeUpdate.select("text")
                    .style("fill-opacity", 1);

                // Transition exiting nodes to the parent's new position.
                var nodeExit = node.exit().transition()
                    .duration(this.options.duration)
                    .attr("transform", function(d) { return "translate(" + source.y + "," + source.x + ")"; })
                    .remove();

                nodeExit.select("circle")
                    .attr("r", 1e-6);

                nodeExit.select("text")
                    .style("fill-opacity", 1e-6);

                // Update the links...
                var link = this.svg.selectAll("path.link")
                    .data(links, function(d) { return d.target.id; });

                // Enter any new links at the parent's previous position.
                var linkEnter = link.enter()
                    .insert("g", "g")
                    .attr("class", "linkContainer")
                    .attr("id", function(d) { 
                        let u_id = d.source.id + '-' + d.target.id;
                        return u_id;
                    });
                linkEnter.append("path")
                    .attr("class", "link")
                    .attr("d", function(d) {
                        var o = {x: source.x0, y: source.y0};
                        return that.diagonal({source: o, target: o});
                    });


                linkEnter.append('rect')
                    .attr("class", "rectText linkLabel")
                    .attr("rx", 5)
                    .attr("ry", 5)
                    .attr("transform", function(d) {
                        let xoffset = d.target.linkname !== undefined ? that.letterWidth*that.adjust_text_length(d.target.linkname).length/2 : 0;
                        let yoffset = 10;
                        return "translate(" +
                            (d.source.y-xoffset) + "," + 
                            (d.source.x-yoffset) + ")";
                        })
                    .style("opacity", 1e-6);
                linkEnter.append('text')
                    .attr("class", "linkText linkLabel")
                    .attr("font-family", "Arial, Helvetica, sans-serif")
                    .attr("fill", "Black")
                    .attr("transform", function(d) {
                        return "translate(" +
                            d.source.y + "," + 
                            d.source.x + ")";
                        })
                    .attr("dy", ".35em")
                    .attr("text-anchor", "middle")
                    .text(function(d) {
                        return that.adjust_text_length(d.target.linkname);
                     })
                    .style("fill-opacity", 1e-6);

                // update rectangle size based on text
                linkEnter.selectAll("rect")
                    .attr("width", function(d) { return d.target.linkname !== undefined ? that.letterWidth*that.adjust_text_length(d.target.linkname).length : 0; })
                    .attr("height", 22)

                // setup onclick on link label
                if (this.options.interaction) {
                    linkEnter.on("click", function(d, i) { 
                        that.clickLabel(d);
                    });
                }


                // Transition links to their new position.
                var linkUpdate = link;
                linkUpdate.select('path').transition()
                    .duration(this.options.duration)
                    .attr("d", this.diagonal);

                linkUpdate.select('rect').transition()
                    .duration(this.options.duration)
                    .style("opacity", 0.85)
                    .attr("d", this.diagonal)
                    .attr("transform", function(d){
                        let xoffset = d.target.linkname !== undefined ? that.letterWidth*that.adjust_text_length(d.target.linkname).length/2 : 0;
                        let yoffset = 10;
                        return "translate(" +
                            ((d.source.y + d.target.y)/2-xoffset) + "," + 
                            ((d.source.x + d.target.x)/2-yoffset) + ")";
                        }
                    );
                linkUpdate.select('text').transition()
                    .duration(this.options.duration)
                    .style("fill-opacity", 1)
                    .attr("d", this.diagonal)
                    .attr("transform", function(d){
                        return "translate(" +
                            ((d.source.y + d.target.y)/2) + "," + 
                            ((d.source.x + d.target.x)/2) + ")";
                        }
                    );
                    
                // Transition exiting nodes to the parent's new position.
                link.exit().select('path').transition()
                    .duration(this.options.duration)
                    .attr("d", function(d) {
                        var o = {x: source.x, y: source.y};
                        return that.diagonal({source: o, target: o});
                    })
                    .remove();

                // Stash the old positions for transition.
                nodes.forEach(function(d) {
                    d.x0 = d.x;
                    d.y0 = d.y;
                });
            },

            find_child_index: function(child) {
                var c_id = child.id;
                var par = child.parent;
                if (!par) {
                    return;
                }
                var children = par.children;
                for (var i=0; i<children.length; i++) {
                    if (children[i].id == c_id) {
                        return i;
                        break;
                    }
                }
            },

            find_full_path: function(d, res) {
                if (d.parent) {
                    var index = this.find_child_index(d);
                    res.push(index);
                    return this.find_full_path(d.parent, res);
                } else {
                    return res;
                }
            },

            // Toggle children on click.
            click: function(d, i, clickedContext) {
                var that = this;
                var o_depth = d.depth;
                var c_id = d.id;
                var c_index = this.find_child_index(d);
                var clicked = d3.select(clickedContext);
                var itemColor = this.itemColors.get(this.currentPicking);

                this.reset_selected();

                // select all nodes matching the clicked element
                var res;
                if (clicked.data()[0].children === undefined) { // is leaf
                    res = d3.selectAll(".node circle")
                        .filter(function(d) {
                            if (d.depth == 0) {
                                return false;
                            }
                            var c1 = d.depth == o_depth;
                            var c2 = d.parent.id - c_index -1 == d.id;
                            var notClicked = d.id != c_id;
                            return c1 && c2;
                        });
                } else {
                    // check if children is leaf
                    var child = clicked.data()[0].children[0];
                    if (that.isObject(child) || Array.isArray(child)) {
                        // First child is not a node, should highlight the label instead
                        // --> simulate label click
                        let source = clicked.data()[0];
                        let target = clicked.data()[0].children[0];
                        var resL = this.svg.selectAll("path.link").filter(function(d) {
                            return d.source.id == source.id && d.target.id == target.id;
                        });
                        that.clickLabel(resL.data()[0]);
                        return;
                    } else {
                        res = d3.selectAll(".node circle")
                            .filter(function(d) {
                                return d.parent !== null && d.parent.id == clicked.data()[0].id;
                            });
                    }
                }

                res.data().forEach(function(elem) {
                    if (elem.picked !== undefined  && elem.picked != '') {
                        // alert || repick conflicting ????
                        console.log('Possible collision with '+elem.picked);
                        //alert('Possible collision with '+elem.picked);
                    }
                    elem.picked = that.currentPicking;
                });

                res.style('fill', itemColor)
                    .style('fill-opacity', 1.0);

                // find all paths
                var paths = [];
                var nodes = d3.selectAll(".node circle").filter(
                        function(d) { return d.picked == that.currentPicking;}
                );
                nodes.data().forEach(function(d, i) {
                    paths[i] = that.find_full_path(d, []);
                });
                var instructions = this.compute_mapping_instructions(paths);
                this.add_instruction(instructions);
            },

            clickLabel: function(d) {
                var u_id = d.source.id + '-' + d.target.id;
                var l_id = '#'+u_id;

                var that = this;
                var o_depth = d.source.depth;
                var dest_depth = d.target.depth;
                var c_id = d.source.id;
                var c_index; // no index as the index is the label itself
                var itemColor = this.itemColors.get(this.currentPicking);

                this.reset_selected();

                // select all labels matching the clicked element
                var resRect = this.svg.selectAll(".rectText")
                    .filter(function(d) {
                        if (d.depth == 0) {
                            return false;
                        }
                        var c1 = d.source.depth == o_depth;
                        return c1;
                    });
                var resText = this.svg.selectAll(".linkText")
                    .filter(function(d) {
                        if (d.depth == 0) {
                            return false;
                        }
                        var c1 = d.source.depth == o_depth;
                        return c1;
                    });


                resRect.data().forEach(function(elem) {
                    if (elem.picked !== undefined  && elem.picked != '') {
                        // alert || repick conflicting ????
                        console.log('Possible collision with '+elem.picked);
                        //alert('Possible collision with '+elem.picked);
                    }
                    elem.picked = that.currentPicking;
                });

                resRect.style('fill', itemColor)
                resText.style('fill', that.should_invert_text_color(itemColor) ? 'white' : 'black');

                // find all paths
                var paths = [];
                var nodes = that.svg.selectAll(".node circle").filter(
                        function(d) { return d.depth == dest_depth;}
                );

                nodes.data().forEach(function(d, i) {
                    paths[i] = that.find_full_path(d, []);
                });
                var instructions = this.compute_mapping_instructions(paths);
                this.add_instruction(instructions);

            },

            reset_selected: function() {
                var that = this;
                var resNode = that.svg.selectAll(".node circle")
                    .filter(function(d) {
                        return d.picked == that.currentPicking;
                    });
                resNode.style('fill', 'white')
                    .style('fill-opacity', 1.00);

                resNode.data().forEach(function(elem) {
                    elem.picked = '';
                });


                var resLabel = that.svg.selectAll(".rectText")
                    .filter(function(d) {
                        return d.picked == that.currentPicking;
                    });
                resLabel.style('fill', 'white')
                    .style('fill-opacity', 1.00);

                resLabel.data().forEach(function(elem) {
                    elem.picked = '';
                });

                this.add_instruction('');
            },


            compute_mapping_instructions: function(d) {
                var mapping = [];
                for (var i=0; i<d[0].length; i++) {
                    var prevVal = null;
                    var instruction = null;
                    for (var j=0; j<d.length; j++) {
                        var arr = d[j];
                        if (prevVal === null) {
                            prevVal = arr[i];
                        } else {
                            if (prevVal != arr[i]) { // value different, nood to loop over them
                                instruction = 'l'
                                break;
                            }
                        }
                    }
                    instruction = instruction !== null ? instruction : prevVal;
                    mapping.unshift(instruction);
                }
                return mapping;
            },
            

            draw_mapping_table: function() {
                var that = this;
                this.mappingDomTable = $('<table class="table mappingTable"></table>');
                var thead = $('<thead></thead>')
                var tbody = $('<tbody></tbody>')
                var row1 = $('<tr></tr>');
                var row2 = $('<tr style="height: 20px;"></tr>');
                var row3 = $('<tr style="height: 20px;"></tr>');
                this.options.toBeMapped.forEach(function(item, index) {
                    var itemColor = that.options.itemColors[index];
                    var cellH = $('<th data-map="'+item+'">'+item+'</th>');
                    var cellB = $('<td id="'+item+'Cell" data-map="'+item+'"></td>');
                    var cellB2 = $('<td id="'+item+'CellFun" class="cellFunInput" data-map="'+item+'"></td>');
                    var fun_head = $('<span><span style="color: mediumblue;">function</span> (value, datum) {</span>');
                    var fun_foot = $('<span>}</span>');
                    var fun_foot_res = $('<span class="funResText">&gt <span style="color: mediumblue;">function</span> (<span id="funXInput-'+item+'">x</span>, d) = <span id="funXOuput-'+item+'">x</span></span>');
                    var fun_input = $('<textarea id="'+item+'" rows="1"></textarea>');
                    fun_input.val(that.options.default_function);
                    cellB2.append(fun_head);
                    cellB2.append(fun_input);
                    cellB2.append(fun_foot);
                    cellB2.append(fun_foot_res);
                    cellH.click(function() { that.set_current_mapping_item(item); });
                    cellB.click(function() { that.set_current_mapping_item(item); });
                    cellB2.click(function() { that.set_current_mapping_item(item); });
                    that.set_color(cellH, itemColor);
                    that.set_color(cellB, itemColor);
                    that.set_color(cellB2, itemColor);
                    row1.append(cellH);
                    row2.append(cellB);
                    row3.append(cellB2);
                });
                thead.append(row1);
                tbody.append(row2);
                tbody.append(row3);
                this.mappingDomTable.append(thead);
                this.mappingDomTable.append(tbody);
                this.fillValueDomInput = $('<input class="form-control" placeholder="0" value="empty">');
                var configDiv = $('<div class="form-group mappingTableDivConfig"></div>')
                    .append($('<label>Fill value</label>'))
                    .append(this.fillValueDomInput);
                var div = $('<div></div>');
                div.append(this.mappingDomTable);
                div.append(configDiv);
                this.container.prepend(div);

                this.fillValueDomInput.on('input', function() {
                    that.update_result_tree();
                });
                $('.mappingTable textarea').on('input', function() {
                    that.update_result_tree();
                });
            },

            set_color: function(item, color) {
                item.css('background-color', color);
                if (this.should_invert_text_color(color)) {
                    item.css('color', 'white');
                } else {
                    item.css('color', 'black');
                }
            },

            should_invert_text_color: function(color) {
                var colorS = color.replace('#', '');
                var r = parseInt('0x'+colorS.substring(0,2));
                var g = parseInt('0x'+colorS.substring(2,4));
                var b = parseInt('0x'+colorS.substring(4,6));
                var avg = ((2 * r) + b + (3 * g))/6;
                if (avg < 128) {
                    return true;
                } else {
                    return false;
                }
            },

            // if name is empty, select first item not having instructions
            set_current_mapping_item: function(name) {
                if (name === undefined) {
                    for (var entry of this.options.toBeMapped) {
                        if (this.instructions[entry].length == 0) {
                            name = entry;
                            break;
                        }
                    }
                    if (name === undefined) { // all items have a mapping, do nothing
                        return;
                    }
                }
                this.mappingDomTable.find('td').addClass('grey');
                this.mappingDomTable.find('th').addClass('grey');
                this.mappingDomTable.find('td').removeClass('picking');
                this.mappingDomTable.find('th').removeClass('picking');
                //var cell = this.mappingDomTable.find('#'+name+'Cell');
                var cells = this.mappingDomTable.find('[data-map="'+name+'"]');
                var itemColor = this.itemColors.get(name);
                cells.removeClass('grey');
                this.currentPickingCell = this.mappingDomTable.find('#'+name+'Cell');
                this.currentPicking = name;
            },

            add_instruction: function(instructions) {
                this.instructions[this.currentPicking] = instructions;
                this.currentPickingCell.text(instructions.toString());
                this.set_current_mapping_item();
                this.update_result_tree();
            },

            // destroy and redraw
            update_result_tree: function() {
                var options = {
                    interaction: false
                };

                var continue_update = this.render_functions_output();
                if (!continue_update) {
                    return
                }

                // collect functions
                var functions = {};
                $('.mappingTable textarea').each(function() {
                    var dom = $(this);
                    var f_body = dom.val();
                    functions[dom[0].id] = new Function('value', 'd', f_body);
                });

                // perform mapping
                var pm_options = {
                    fillValue: this.fillValueDomInput.val(),
                    functions: functions
                };
                var adjustedInstructions = this.adjust_instruction();
                var result = new $.proxyMapper(adjustedInstructions, this.data, pm_options);

                // destroy and redraw
                this.treeDivResult[0].innerHTML = '';
                new TreeFromJson(this.treeDivResult, result, options);
            },

            adjust_instruction: function() {
                var adjustedInstructions = $.extend(true, {}, this.instructions);
                adjustedInstructions.index = {};
                var matchingIndex = 0;
                var l = this.instructions.labels;
                var v = this.instructions.values;
                var d = this.instructions.dates;
                // label & value
                if (l.length != 0 && v.length != 0) {
                    var smaller_array = v.length < l.length ? v : l;
                    for (var i=0; i<smaller_array.length; i++) {
                        if (v[i] != l[i]) { 
                            matchingIndex = i-1;
                            break;
                        }
                    }
                    adjustedInstructions.values[matchingIndex] = 'i1';
                    adjustedInstructions.index['i1'] = adjustedInstructions.labels.slice(matchingIndex+1);
                }

                var matchingIndex = 0;
                // date & value
                if (d.length != 0 && v.length != 0) {
                    smaller_array = v.length < d.length ? v : d;
                    for (var i=0; i<smaller_array.length; i++) {
                        if (v[i] != d[i]) { 
                            matchingIndex = i-1;
                            break;
                        }
                    }
                    adjustedInstructions.values[matchingIndex] = 'i2';
                    adjustedInstructions.index['i2'] = adjustedInstructions.dates.slice(matchingIndex+1);
                }

                return adjustedInstructions;
            },

            render_functions_output: function() {
                var that = this;
                var flag_continue = true;
                $('.mappingTable textarea').each(function() {
                    var c_id = $(this).attr('id');
                    var f_body = $(this).val();
                    var funXInput = $('#funXInput-'+c_id);
                    var funXOuput = $('#funXOuput-'+c_id);
                    // check if valid function
                    try {
                        var f = new Function('value', 'd', f_body);
                        var nodes = that.svg.selectAll(".node circle").filter(
                            function(d) { return d.picked === c_id;}
                        );
                        var x = nodes.data()[0].name;
                        funXInput.text('"'+that.adjust_text_length(x)+'"');
                        funXOuput[0].innerHTML = that.adjust_text_length('"'+f(x)+'"');
                    } catch(err) { // Error
                        if (err.name == 'SyntaxError') {
                            flag_continue = false;
                            funXOuput[0].innerHTML = $('<span class="funOutputError">'+err.name+'</span>')[0].outerHTML;
                        } else if (err.name == 'TypeError') {
                            var html = $('<span></span>');
                            html.append($('<span class="funOutputError">'+'Not picked yet'+'</span>'));
                            html.append($('<span class="funOutputError">'+err.name+'</span>'));
                            funXOuput[0].innerHTML = html[0].outerHTML;
                        } else {
                            funXOuput[0].innerHTML = $('<span class="funOutputError">'+err.name+'</span>')[0].outerHTML;
                        }
                    }
                });
                return flag_continue;
            },

            isObject: function(v) {
                return v !== null && typeof v === 'object';
            },

            adjust_text_length: function(text) {
                if (text === undefined || text === '') {
                    return '';
                }
                text = new String(text);
                var textSliced = text.slice(0, this.options.maxCharDisplay);
                if (text.length > this.options.maxCharDisplay) {
                    textSliced += '...';
                }
                return textSliced;
            },

            create_tree: function(root, linkname, depth, maxDepth, maxWidth) {
                if (depth == 0) {
                    return;
                }
                var child = {
                    parent: null,
                    linkname: linkname
                };

                if (Array.isArray(root)) {
                    child.children = [];

                    for (var node of root.slice(0, maxWidth)) {
                        child.children.push(this.create_tree(node, '', depth-1, maxDepth, maxWidth));
                    }
                    if (root.length > maxWidth) {
                        var addNode = {};
                        var remaining = root.length - maxWidth;
                        addNode.name = ''+remaining+'...';
                        addNode.parent = null;
                        addNode.additionalNode = true;
                        child['children'].push(addNode);
                    }

                } else if (this.isObject(root)) {
                    child.children = [];

                    var i = 0;
                    for (var k in root) {
                        if (i > maxWidth) {
                            break;
                        }
                        var node = root[k];
                        child.children.push(this.create_tree(node, k, depth-1, maxDepth, maxWidth));
                        i++;
                    }
                    if (Object.keys(root).length > maxWidth) {
                        var addNode = {};
                        var remaining = root.length - maxWidth;
                        addNode.name = ''+remaining+' ...';
                        addNode.parent = null;
                        addNode.additionalNode = true;
                        child.children.push(addNode);
                    }

                } else {
                    child.name = root;
                }
                return child;
            },

            syntaxHighlightJson: function(json) {
                if (typeof json == 'string') {
                    json = JSON.parse(json);
                }
                json = JSON.stringify(json, undefined, 2);
                json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/(?:\r\n|\r|\n)/g, '<br>').replace(/ /g, '&nbsp;');
                return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
                        var cls = 'json_number';
                        if (/^"/.test(match)) {
                            if (/:$/.test(match)) {
                                cls = 'json_key';
                            } else {
                                cls = 'json_string';
                            }
                        } else if (/true|false/.test(match)) {
                            cls = 'json_boolean';
                        } else if (/null/.test(match)) {
                            cls = 'json_null';
                        }
                        return '<span class="' + cls + '">' + match + '</span>';
                });
            }


        }

        $.treeFromJson = TreeFromJson;
        $.fn.treeFromJson = function(data, option) {
            var pickerArgs = arguments;
            var tfj;

            this.each(function() {
                var $this = $(this),
                    inst = $this.data('treeFromJson'),
                    options = ((typeof option === 'object') ? option : {});
                if ((!inst) && (typeof option !== 'string')) {
                    tfj = new TreeFromJson($this, data, options);
                    $this.data('treeFromJson', tfj);
                } else {
                    if (typeof option === 'string') {
                        inst[option].apply(inst, Array.prototype.slice.call(pickerArgs, 1));
                    }
                }
            });
            return tfj;
        }
        $.fn.treeFromJson.constructor = TreeFromJson;
    })
);
